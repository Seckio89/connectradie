-- Add stripe_checkout_session_id to recurring_invoices for reliable webhook matching
-- (payment_intent is null at checkout session creation time)
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- Index for fast webhook lookup
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_checkout_session
  ON recurring_invoices (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
