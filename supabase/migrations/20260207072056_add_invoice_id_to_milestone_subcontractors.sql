/*
  # Add invoice_id to milestone_subcontractors

  1. Modified Tables
    - `milestone_subcontractors`
      - Added `invoice_id` (uuid, references invoices) - optional link to a platform-created invoice

  2. Notes
    - Allows linking platform-created invoices directly to subcontractor entries
    - Used for auto-populating subcontractor details from structured invoice data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'milestone_subcontractors' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE milestone_subcontractors ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;
