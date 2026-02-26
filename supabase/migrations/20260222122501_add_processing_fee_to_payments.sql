/*
  # Add processing fee tracking to payments table

  1. Modified Tables
    - `payments`
      - `processing_fee` (integer, default 0) - Processing fee in cents, stored separately from base amount
      - The existing `amount` column represents the base service amount (what the tradie earns)
      - `processing_fee` represents the 2% surcharge passed to the client

  2. Important Notes
    - Base amount + processing fee = total charged to client
    - Tradie always receives exactly the base `amount`
    - Default of 0 ensures backward compatibility with existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'processing_fee'
  ) THEN
    ALTER TABLE payments ADD COLUMN processing_fee integer NOT NULL DEFAULT 0;
  END IF;
END $$;
