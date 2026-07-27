-- Migration: disputes_require_escrow
-- Phase 4 of AI-assisted dispute handling.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THE SPEC ASKED FOR vs WHAT THIS SCHEMA HAS
-- ─────────────────────────────────────────────────────────────────────────────
-- The spec says "direct-payment (non-escrow) jobs cannot open disputes". There
-- is no `payment_method` column on `jobs` — direct/external pay is a
-- client_contacts concept belonging to off-app recurring invoicing, and
-- 20260725180000 currently COERCES every one of those back to escrow anyway.
-- So "a direct-payment job" is not a thing that exists to test for.
--
-- What does exist, and is the same rule in this schema's own terms:
--
--   A dispute's entire power is that it stops auto-release. And
--   `auto-release-payments` only ever acts on payments with
--   payment_type='job_funding' AND status='completed'.
--
-- So on a job with no such payment, a dispute freezes nothing. It is not
-- harmless: the client is told "Payment on this job is on hold until our team
-- reviews", which on an unfunded job is simply false — and it puts a case in
-- the admin queue that no admin action can resolve, because the platform is
-- holding no money. `create-job-payment-checkout` builds destination charges
-- (transfer_data.destination — funds go straight to the tradie), so jobs paid
-- outside escrow genuinely occur.
--
-- Hence: a dispute requires that the platform actually collected escrow for the
-- job. 'released' counts — that is exactly the case that started this whole
-- thread (a client wanting recourse after the money went out), and the admin
-- claw-back in Admin → Payments is the remedy. 'refunded' does NOT count: the
-- client already has their money back, so there is nothing to dispute.
--
-- Enforced in TWO places, as the spec requires:
--   * a BEFORE INSERT trigger — carries a readable message and, unlike RLS,
--     also binds the service role
--   * the RLS INSERT policy — the backstop if the trigger is ever disabled

-- ── 1. Is there platform-held (or platform-released) escrow for this job? ────
-- SECURITY DEFINER is safe here and is NOT the trap that killed the billing
-- lock: this function takes the job id as an ARGUMENT and returns a boolean. It
-- makes no decision about who the caller is, so there is no caller-identity
-- check for DEFINER to quietly satisfy. It needs DEFINER because the tradie
-- raising a dispute may have no RLS read on the client's payment row.
CREATE OR REPLACE FUNCTION public.job_has_platform_escrow(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE job_id = p_job_id
      AND payment_type = 'job_funding'
      AND status IN ('completed', 'released')
  );
$$;

COMMENT ON FUNCTION public.job_has_platform_escrow(uuid) IS
  'True when ConnecTradie collected escrow for this job (a job_funding payment that '
  'reached completed or released). Mirrors the filter auto-release-payments uses, so '
  '"a dispute can freeze this" and "this job is escrowed" cannot drift apart.';

REVOKE ALL ON FUNCTION public.job_has_platform_escrow(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.job_has_platform_escrow(uuid) TO authenticated;

-- ── 2. Trigger: the readable block, and the one that binds the service role ──
CREATE OR REPLACE FUNCTION public.enforce_dispute_requires_escrow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.job_has_platform_escrow(NEW.job_id) THEN
    -- 23514 (check_violation) so PostgREST returns 400 rather than 500, and the
    -- message below reaches the user instead of a generic failure.
    RAISE EXCEPTION 'Disputes are only available on jobs paid through ConnecTradie. This job has no payment held by us, so there is nothing for our team to hold or return.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispute_requires_escrow ON public.disputes;
CREATE TRIGGER trg_dispute_requires_escrow
  BEFORE INSERT ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispute_requires_escrow();

-- ── 3. RLS backstop ─────────────────────────────────────────────────────────
-- Same rule in the policy, so disabling the trigger does not silently reopen
-- the hole. Everything else in this policy is unchanged from 20260726260000.
DROP POLICY IF EXISTS "Users can create disputes" ON public.disputes;
CREATE POLICY "Users can create disputes" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = (SELECT auth.uid())
    AND against_user <> (SELECT auth.uid())          -- no self-disputes
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        -- caller is on the job
        AND (j.client_id = (SELECT auth.uid()) OR j.tradie_id = (SELECT auth.uid()))
        -- and so is the person being disputed
        AND (j.client_id = against_user OR j.tradie_id = against_user)
    )
    -- and the platform is actually holding (or has released) money for it
    AND public.job_has_platform_escrow(job_id)
  );
