-- Track whether a paid recurring invoice's funds actually reached the tradie.
-- When a BECS (or card) recurring invoice is paid but the tradie has not completed
-- Stripe Connect onboarding, the funds settle into the platform balance and the
-- Connect transfer is skipped. Without a flag these payouts are invisible — this
-- column makes stranded payouts queryable so they can be released after onboarding.
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS payout_status TEXT;

-- Known states:
--   NULL                          -> not applicable / legacy
--   'transferred'                 -> Connect transfer to tradie succeeded
--   'held_onboarding_incomplete'  -> paid, but payout blocked pending tradie Connect onboarding
ALTER TABLE recurring_invoices DROP CONSTRAINT IF EXISTS recurring_invoices_payout_status_check;
ALTER TABLE recurring_invoices ADD CONSTRAINT recurring_invoices_payout_status_check
  CHECK (payout_status IS NULL OR payout_status IN ('transferred', 'held_onboarding_incomplete'));

-- Partial index so an admin/ops query for held payouts stays cheap.
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_payout_held
  ON recurring_invoices(payout_status)
  WHERE payout_status = 'held_onboarding_incomplete';
