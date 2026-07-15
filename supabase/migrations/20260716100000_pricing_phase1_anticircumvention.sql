-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing rebuild — PHASE 1: anti-circumvention (additive, no money-flow change).
--
-- Core model: money moves through Stripe escrow for everyone EXCEPT the Property
-- Manager tier. This phase puts the guardrails in place WITHOUT touching fee math
-- or escrow timing (those are later, deferred phases):
--   1. Persist ToS acceptance (audit trail).
--   2. Direct/external pay is a PM-tier feature. Existing tradies are grandfathered
--      (external_pay_allowed); a non-PM, non-grandfathered tradie who sets a client
--      to 'external' is silently routed to 'stripe' (escrow) — a server-side gate
--      that never breaks adding a client.
--   3. Off-platform payment talk in chat is FLAGGED (never blocked) by a trigger.
--   4. job_contact_details + funded-gated RLS — the mechanism to reveal client
--      contact only once escrow is funded (population + read-rewire is a later step).
--
-- Additive only — no existing column/row is modified destructively.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ToS acceptance audit + external-pay grandfather flag ──────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_version text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS external_pay_allowed boolean NOT NULL DEFAULT false;

-- Grandfather every EXISTING tradie: their current external-pay workflow keeps
-- working. New signups default false → gated to Stripe unless on the PM tier.
UPDATE public.profiles SET external_pay_allowed = true WHERE role = 'tradie';

COMMENT ON COLUMN public.profiles.external_pay_allowed IS
  'Grandfathered permission to set clients to external/direct pay. New non-PM tradies are false (escrow-only).';

-- ── 2. Direct/external-pay gate (server-side, coerce not block) ──────────────
CREATE OR REPLACE FUNCTION public.enforce_external_pay_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_tier text;
BEGIN
  IF NEW.payment_method = 'external' THEN
    SELECT p.external_pay_allowed, p.subscription_tier
      INTO v_allowed, v_tier
      FROM public.profiles p
      WHERE p.id = NEW.owner_id;
    -- Allowed only for grandfathered tradies or the Property Manager tiers.
    IF NOT COALESCE(v_allowed, false)
       AND COALESCE(v_tier, 'free') NOT IN ('pm_starter', 'pm_pro', 'pm_enterprise') THEN
      NEW.payment_method := 'stripe'; -- route to escrow instead of failing the insert
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_external_pay_tier ON public.client_contacts;
CREATE TRIGGER trg_enforce_external_pay_tier
  BEFORE INSERT OR UPDATE OF payment_method ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_external_pay_tier();

-- ── 3. message_flags + off-platform-payment detection ───────────────────────
CREATE TABLE IF NOT EXISTS public.message_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  flag_type text NOT NULL DEFAULT 'off_platform_payment',
  matched_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_flags_message_id ON public.message_flags(message_id);
CREATE INDEX IF NOT EXISTS idx_message_flags_job_id ON public.message_flags(job_id);
CREATE INDEX IF NOT EXISTS idx_message_flags_sender_id ON public.message_flags(sender_id);

ALTER TABLE public.message_flags ENABLE ROW LEVEL SECURITY;

-- Conversation participants can see flags on their own messages; service role (and
-- admins via service) manage. Flags are written by the trigger below, not users.
DROP POLICY IF EXISTS "Participants read message flags" ON public.message_flags;
CREATE POLICY "Participants read message flags" ON public.message_flags
  FOR SELECT TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND ((SELECT auth.uid()) IN (m.sender_id, m.receiver_id))
    )
  );

DROP POLICY IF EXISTS "Service manages message flags" ON public.message_flags;
CREATE POLICY "Service manages message flags" ON public.message_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Detect off-platform payment talk and FLAG it (never block the message). Runs as
-- definer so it can write message_flags regardless of the sender's RLS.
CREATE OR REPLACE FUNCTION public.flag_offplatform_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text := COALESCE(NEW.content, '');
BEGIN
  IF v_content ~* '(pay(ing)?\s+(me\s+)?(in\s+)?cash|bank\s*transfer|direct\s*deposit|e-?transfer|pay\s*id|payid|\bbsb\b|\bosko\b|off\s*(the\s*)?(app|platform)|around\s+the\s+app|paypal|venmo|zelle|cash\s+in\s+hand|account\s*(number|no)\b|\b\d{3}-?\d{3}\b\s*\d{6,9})'
  THEN
    INSERT INTO public.message_flags (message_id, conversation_id, job_id, sender_id, flag_type, matched_text)
    VALUES (NEW.id, NEW.conversation_id, NEW.job_id, NEW.sender_id, 'off_platform_payment', left(v_content, 280));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_offplatform_payment ON public.messages;
CREATE TRIGGER trg_flag_offplatform_payment
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.flag_offplatform_payment();

-- ── 4. job_contact_details — funded-gated contact reveal (mechanism) ─────────
CREATE TABLE IF NOT EXISTS public.job_contact_details (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  contact_name text,
  contact_phone text,
  contact_email text,
  address text,
  access_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_contact_details ENABLE ROW LEVEL SECURITY;

-- The client who owns the job always sees it. The assigned tradie sees it only
-- once the job is FUNDED (escrow paid) or later — the anti-circumvention gate.
DROP POLICY IF EXISTS "Client reads own job contact" ON public.job_contact_details;
CREATE POLICY "Client reads own job contact" ON public.job_contact_details
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id AND j.client_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Assigned tradie reads funded job contact" ON public.job_contact_details;
CREATE POLICY "Assigned tradie reads funded job contact" ON public.job_contact_details
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id
      AND j.tradie_id = (SELECT auth.uid())
      AND j.status = ANY (ARRAY['funded', 'in_progress', 'completed'])
  ));

DROP POLICY IF EXISTS "Service manages job contact" ON public.job_contact_details;
CREATE POLICY "Service manages job contact" ON public.job_contact_details
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.job_contact_details IS
  'Client contact revealed to the assigned tradie only once the job is funded (escrow paid). Population + read-rewire off jobs is a later activation step.';
