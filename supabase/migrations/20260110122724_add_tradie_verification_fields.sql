/*
  # Add Tradie Verification Fields

  1. New Columns
    - `insurance_provider` (text) - Name of insurance provider
    - `policy_number` (text) - Insurance policy number
    - `qualifications` (text[]) - Array of qualification strings
    - `contractor_type` (text) - Type: 'Solo', 'Company', 'Labour Hire'
  
  2. Changes
    - Add new columns to `tradie_details` table
    - Use default empty values for existing rows
  
  3. Notes
    - Qualifications stored as text array for flexibility
    - Contractor type uses check constraint for data integrity
*/

DO $$
BEGIN
  -- Add insurance_provider column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'insurance_provider'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN insurance_provider text DEFAULT '';
  END IF;

  -- Add policy_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'policy_number'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN policy_number text DEFAULT '';
  END IF;

  -- Add qualifications column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'qualifications'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN qualifications text[] DEFAULT '{}';
  END IF;

  -- Add contractor_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'contractor_type'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN contractor_type text DEFAULT 'Solo';
  END IF;
END $$;

-- Add check constraint for contractor_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tradie_details_contractor_type_check'
  ) THEN
    ALTER TABLE tradie_details
    ADD CONSTRAINT tradie_details_contractor_type_check
    CHECK (contractor_type IN ('Solo', 'Company', 'Labour Hire'));
  END IF;
END $$;
