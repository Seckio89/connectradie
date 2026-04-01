-- BECS Direct Debit support for recurring service invoices
-- Allows clients to save a bank account (BECS mandate) for automatic invoice payments

-- 1. Saved payment methods table (one per recurring job)
CREATE TABLE IF NOT EXISTS saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tradie_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recurring_job_id UUID NOT NULL REFERENCES recurring_jobs(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  payment_method_type TEXT NOT NULL DEFAULT 'au_becs_debit',
  bsb_last4 TEXT,
  account_last4 TEXT,
  bank_name TEXT,
  mandate_status TEXT NOT NULL DEFAULT 'active'
    CHECK (mandate_status IN ('active', 'revoked', 'failed')),
  stripe_mandate_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saved_payment_methods_recurring_job_unique UNIQUE (recurring_job_id)
);

-- Indexes
CREATE INDEX idx_saved_payment_methods_client ON saved_payment_methods(client_id, mandate_status);
CREATE INDEX idx_saved_payment_methods_pm ON saved_payment_methods(stripe_payment_method_id);

-- RLS
ALTER TABLE saved_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own saved payment methods"
  ON saved_payment_methods FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Tradies can view saved methods for their jobs"
  ON saved_payment_methods FOR SELECT
  TO authenticated
  USING (tradie_id = auth.uid());

CREATE POLICY "Clients can delete own saved payment methods"
  ON saved_payment_methods FOR DELETE
  TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Service role full access to saved payment methods"
  ON saved_payment_methods FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Add BECS fields to recurring_invoices
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS becs_charge_status TEXT,
  ADD COLUMN IF NOT EXISTS becs_failed_at TIMESTAMPTZ;

-- Update status CHECK to include 'processing'
ALTER TABLE recurring_invoices DROP CONSTRAINT IF EXISTS recurring_invoices_status_check;
ALTER TABLE recurring_invoices ADD CONSTRAINT recurring_invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'processing'));

-- 3. Add preferred payment method to recurring_jobs
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT DEFAULT 'card';

-- 4. Notification insert RLS for saved_payment_methods webhook flow
-- (notifications table already has service_role insert policy from prior migrations)
