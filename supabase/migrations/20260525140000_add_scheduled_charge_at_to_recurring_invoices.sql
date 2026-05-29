-- Delayed auto-charge for BECS recurring invoices. When set, an invoice will be
-- automatically debited at this time unless the client disputes it first. NULL means
-- the invoice follows the manual approve-to-pay flow (card jobs, or no active mandate).
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS scheduled_charge_at TIMESTAMPTZ;

-- Partial index so the hourly auto-charge cron pass stays cheap.
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_scheduled_charge
  ON recurring_invoices(scheduled_charge_at)
  WHERE scheduled_charge_at IS NOT NULL;
