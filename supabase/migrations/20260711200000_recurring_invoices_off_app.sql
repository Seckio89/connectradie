-- Off-app recurring invoices: bill an off-app client_contact (no homeowner
-- profile). homeowner_id is already nullable; add the contact reference so the
-- invoice-contact function can create + track a Stripe checkout invoice emailed
-- to the contact. The webhook already marks these paid by stripe_checkout_session_id.
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_client_contact ON recurring_invoices(client_contact_id);
