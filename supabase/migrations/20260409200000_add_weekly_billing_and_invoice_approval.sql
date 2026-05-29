-- Add 'weekly' to billing_cycle options on recurring_jobs
ALTER TABLE recurring_jobs DROP CONSTRAINT IF EXISTS recurring_jobs_billing_cycle_check;
ALTER TABLE recurring_jobs ADD CONSTRAINT recurring_jobs_billing_cycle_check
  CHECK (billing_cycle = ANY (ARRAY['weekly', 'fortnightly', 'monthly']));

-- Add 'pending_approval' status to recurring_invoices
ALTER TABLE recurring_invoices DROP CONSTRAINT IF EXISTS recurring_invoices_status_check;
ALTER TABLE recurring_invoices ADD CONSTRAINT recurring_invoices_status_check
  CHECK (status = ANY (ARRAY['draft', 'pending_approval', 'sent', 'paid', 'overdue', 'cancelled', 'processing']));

-- Add approval tracking columns to recurring_invoices
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id);
