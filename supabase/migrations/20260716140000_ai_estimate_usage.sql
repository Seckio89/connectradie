-- ─────────────────────────────────────────────────────────────────────────────
-- AI estimate usage limits.
--   Free tier: 10 AI estimates per calendar month (photos or not), unlimited
--               manual pricing.
--   Pro / PM:  unlimited AI estimates incl. photo analysis.
--
-- Additive only. The usage ledger is written by the estimate-quote edge function
-- (service role); tradies can read their own rows but never write them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Per-tier monthly AI-estimate allowance (NULL = unlimited) ──────────────
ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS ai_estimates_monthly_limit integer;

UPDATE public.pricing_tiers SET ai_estimates_monthly_limit = 10   WHERE id = 'free';
UPDATE public.pricing_tiers SET ai_estimates_monthly_limit = NULL WHERE id IN ('pro', 'pm');

COMMENT ON COLUMN public.pricing_tiers.ai_estimates_monthly_limit IS
  'Max AI job estimates per calendar month for this tier. NULL = unlimited (Pro, PM); Free = 10.';

-- ── 2. Usage ledger — one row per AI estimate run ────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_estimate_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  used_photos boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Count-by-month lookups filter on (profile_id, created_at).
CREATE INDEX IF NOT EXISTS idx_ai_estimate_usage_profile_month
  ON public.ai_estimate_usage(profile_id, created_at);

ALTER TABLE public.ai_estimate_usage ENABLE ROW LEVEL SECURITY;

-- Tradies read their own usage (for the "N/10 remaining" display). No user
-- INSERT/UPDATE/DELETE — the ledger is written only by the server (service role),
-- so the cap can't be tampered with client-side.
DROP POLICY IF EXISTS "own_usage_read" ON public.ai_estimate_usage;
CREATE POLICY "own_usage_read" ON public.ai_estimate_usage
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service manages ai estimate usage" ON public.ai_estimate_usage;
CREATE POLICY "Service manages ai estimate usage" ON public.ai_estimate_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_estimate_usage IS
  'One row per AI job estimate. Enforces the free-tier monthly cap; server-written, own-read.';
