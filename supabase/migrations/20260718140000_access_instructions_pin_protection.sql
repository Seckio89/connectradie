-- ─────────────────────────────────────────────────────────────────────────────
-- PIN-protected access instructions.
--
-- Client-provided access details (gate codes, key locations, alarm codes) were
-- stored in jobs.access_instructions and shipped to the browser with every job
-- fetch. This makes them SERVER-WITHHELD: the data moves to a service-role-only
-- table, the jobs column is emptied, and it's only returned by the access-pin
-- edge function after the viewer verifies their 4-digit PIN.
--
-- Zero client-write changes: a BEFORE trigger on jobs transparently relocates
-- any access_instructions write into job_access_details and nulls the column.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The protected store (service-role / definer only) ─────────────────────
CREATE TABLE IF NOT EXISTS public.job_access_details (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  access_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_access_details ENABLE ROW LEVEL SECURITY;
-- NO policies for anon/authenticated: the data is unreadable via the REST API.
-- Only the service role (edge functions) and SECURITY DEFINER triggers touch it.
DROP POLICY IF EXISTS "Service manages job access details" ON public.job_access_details;
CREATE POLICY "Service manages job access details" ON public.job_access_details
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.job_access_details IS
  'PIN-gated access instructions (gate/alarm codes, key locations). Never exposed via REST — read only through the access-pin edge function after PIN verification.';

-- ── 2. Trigger: relocate any access_instructions write, null the column ───────
CREATE OR REPLACE FUNCTION public.relocate_access_instructions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_instructions IS NOT NULL AND btrim(NEW.access_instructions) <> '' THEN
    INSERT INTO public.job_access_details (job_id, access_instructions)
    VALUES (NEW.id, NEW.access_instructions)
    ON CONFLICT (job_id) DO UPDATE
      SET access_instructions = EXCLUDED.access_instructions, updated_at = now();
    -- Never persist on jobs → never selectable by the client.
    NEW.access_instructions := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.relocate_access_instructions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_relocate_access_instructions ON public.jobs;
CREATE TRIGGER trg_relocate_access_instructions
  BEFORE INSERT OR UPDATE OF access_instructions ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.relocate_access_instructions();

-- ── 3. Backfill existing rows, then empty the exposed column ─────────────────
INSERT INTO public.job_access_details (job_id, access_instructions)
SELECT id, access_instructions FROM public.jobs
WHERE access_instructions IS NOT NULL AND btrim(access_instructions) <> ''
ON CONFLICT (job_id) DO NOTHING;

UPDATE public.jobs SET access_instructions = NULL
WHERE access_instructions IS NOT NULL;

-- ── 4. Per-user PIN store (service-role only; hash never leaves the server) ───
CREATE TABLE IF NOT EXISTS public.access_pins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,          -- PBKDF2-SHA256, base64
  pin_salt text NOT NULL,          -- per-user salt, base64
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  reset_code_hash text,            -- PBKDF2 of the emailed 6-digit reset code
  reset_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_pins ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: a 4-digit PIN hash is brute-forceable, so it is
-- NEVER readable client-side. All access is via the access-pin edge function.
DROP POLICY IF EXISTS "Service manages access pins" ON public.access_pins;
CREATE POLICY "Service manages access pins" ON public.access_pins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.access_pins IS
  'Per-user 4-digit PIN (PBKDF2-hashed) gating access-instruction reveal, with lockout + email reset. Server-only; never exposed via REST.';
