-- Add 'disputed' status to recurring_invoices
ALTER TABLE recurring_invoices DROP CONSTRAINT IF EXISTS recurring_invoices_status_check;
ALTER TABLE recurring_invoices ADD CONSTRAINT recurring_invoices_status_check
  CHECK (status = ANY (ARRAY['draft', 'pending_approval', 'disputed', 'sent', 'paid', 'overdue', 'cancelled', 'processing']));

-- Add dispute tracking columns
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS tradie_response text,
  ADD COLUMN IF NOT EXISTS tradie_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS resolution_note text;
