/*
  # Add subcontractor payment fields to milestones

  1. Modified Tables
    - `job_milestones`
      - `payment_type` (text) - 'direct' or 'subcontractor' to distinguish payment types
      - `invoice_number` (text) - Invoice/receipt reference number for subcontractor payments
      - `subcontractor_business_name` (text) - Business name only, no personal info

  2. Important Notes
    - Subcontractor payments only show invoice/receipt numbers, avoiding personal info
    - Default payment_type is 'direct' for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_milestones' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE job_milestones ADD COLUMN payment_type text NOT NULL DEFAULT 'direct';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_milestones' AND column_name = 'invoice_number'
  ) THEN
    ALTER TABLE job_milestones ADD COLUMN invoice_number text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_milestones' AND column_name = 'subcontractor_business_name'
  ) THEN
    ALTER TABLE job_milestones ADD COLUMN subcontractor_business_name text DEFAULT NULL;
  END IF;
END $$;
