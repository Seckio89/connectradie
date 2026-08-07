-- ─────────────────────────────────────────────────────────────────────────────
-- Connect balance sweep — ledger table + cron.
--
-- Escrow in this system IS the manual payout schedule: every Express account is
-- created with settings.payouts.schedule.interval = 'manual', so Stripe never
-- moves a tradie's money to their bank on its own. The only routine caller of
-- stripe.payouts.create is the escrow release path, and it fires only for
-- payment_type = 'job_funding'.
--
-- Everything else a destination charge credits to the tradie's Connect balance
-- therefore had no payout owner and stayed there permanently: site-visit
-- call-out fees (book-site-visit writes no payments row at all), bonus payments
-- (create-bonus-payment), and the residue between what a charge credited and
-- what a release paid out. Found live as $20.19 stranded on an account whose
-- Payouts screen read "Ready to pay out" with no action that could move it.
--
-- The sweep-connect-balance function pays out available − held escrow − any
-- unsettled refund. This file gives it a schedule and a record.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The ledger ────────────────────────────────────────────────────────────
-- Without this a sweep leaves no trace anywhere in the database, and the next
-- person asking "did this money move, and why that amount?" is back to
-- reconstructing it from Stripe — the exact archaeology #243 was written to
-- end. The three input figures are stored alongside the amount because the
-- amount alone cannot be checked: available minus reserve IS the decision.
CREATE TABLE IF NOT EXISTS public.payout_sweeps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  stripe_account_id text NOT NULL,
  -- Stripe payout id. UNIQUE so a replayed idempotency key cannot book the same
  -- payout twice, and so a duplicate insert is a loud 23505 rather than a
  -- second row implying money moved twice.
  payout_id         text NOT NULL UNIQUE,

  -- What was sent, and the three numbers that decided it.
  amount_cents      integer NOT NULL CHECK (amount_cents > 0),
  available_cents   integer NOT NULL,
  pending_cents     integer NOT NULL,
  reserve_cents     integer NOT NULL CHECK (reserve_cents >= 0),

  created_at        timestamptz NOT NULL DEFAULT now()
  -- No updated_at: a sweep is a fact about a payout that already happened.
);

CREATE INDEX IF NOT EXISTS idx_payout_sweeps_tradie
  ON public.payout_sweeps(tradie_profile_id, created_at DESC);

COMMENT ON TABLE public.payout_sweeps IS
  'One row per Connect balance sweep: money paid out to a tradie that no escrow release owned (site-visit call-out fees, bonuses, fee residue). Written by sweep-connect-balance via service_role; never user-writable.';
COMMENT ON COLUMN public.payout_sweeps.reserve_cents IS
  'Client escrow still held in the balance at sweep time (fetchEscrowReserveCents). amount_cents was available_cents minus this, minus any negative pending.';

-- ── 2. RLS — a tradie sees only their own; nothing is user-writable ──────────
ALTER TABLE public.payout_sweeps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tradies read own balance sweeps" ON public.payout_sweeps;
CREATE POLICY "Tradies read own balance sweeps" ON public.payout_sweeps
  FOR SELECT TO authenticated USING (tradie_profile_id = (SELECT auth.uid()));

-- Admins read all. is_admin(), not role = 'admin': the platform owner holds
-- is_admin = true while role stays 'tradie', which is the distinction
-- 20260731071155 exists to fix.
DROP POLICY IF EXISTS "Admins read all balance sweeps" ON public.payout_sweeps;
CREATE POLICY "Admins read all balance sweeps" ON public.payout_sweeps
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Service manages balance sweeps" ON public.payout_sweeps;
CREATE POLICY "Service manages balance sweeps" ON public.payout_sweeps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No INSERT/UPDATE/DELETE policy for authenticated: the ledger is written by
-- the edge function under service_role, which bypasses RLS.

-- ── 3. Cron ──────────────────────────────────────────────────────────────────
-- 30 minutes behind auto-release-payments (0 */6 * * *) so a release always
-- gets first claim on a balance it is about to pay out. The reserve makes the
-- ordering safe rather than load-bearing — a failed release leaves its row at
-- status 'completed' with no payout_id, which the reserve counts — but there is
-- no reason to make the two crons argue over the same balance.
SELECT cron.unschedule('sweep-connect-balance')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-connect-balance');

SELECT cron.schedule(
  'sweep-connect-balance',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/sweep-connect-balance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
