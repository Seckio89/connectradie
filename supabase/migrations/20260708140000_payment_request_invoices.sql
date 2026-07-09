/*
  # Off-platform payment requests (worker → employer, BSB/account by email)

  1. New columns on `invoices`
    - `billed_to_user_id` (uuid, FK profiles) — the platform user this invoice is
      billed to (the employer). Existing bill_to_* text fields stay for display.
    - `payment_bsb`, `payment_account_number`, `payment_account_name` (text) —
      the worker's bank details for the employer to pay OFF-PLATFORM (decision:
      no Stripe split / escrow; the platform only records the request).

  2. RLS additions (existing owner policies untouched)
    - The billed party may SELECT invoices billed to them.
    - The billed party may UPDATE them (to mark as paid after transferring).
*/

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billed_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_bsb text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_account_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_account_name text;

CREATE INDEX IF NOT EXISTS idx_invoices_billed_to
  ON invoices(billed_to_user_id) WHERE billed_to_user_id IS NOT NULL;

DROP POLICY IF EXISTS "Billed users can view their invoices" ON invoices;
CREATE POLICY "Billed users can view their invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (billed_to_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Billed users can update their invoices" ON invoices;
CREATE POLICY "Billed users can update their invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (billed_to_user_id = (select auth.uid()))
  WITH CHECK (billed_to_user_id = (select auth.uid()));
