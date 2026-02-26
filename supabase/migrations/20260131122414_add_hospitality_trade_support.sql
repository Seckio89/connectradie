/*
  # Add Hospitality Trade Support

  1. New Columns & Fields
    - `trade_type` (text) - Primary trade type: 'construction' or 'hospitality'
    - `food_safety_cert` (text) - Food Safety Supervisor Certificate number for hospitality tradies
    - `cookery_cert` (text) - Cert III Commercial Cookery certificate for chefs
    - `white_card` (text) - White Card/Construction Induction Card for construction tradies
  
  2. Changes
    - Add trade_type column to tradie_details with check constraint
    - Add hospitality-specific certification columns
    - Add construction-specific certification columns
    - Update existing rows to default to 'construction' trade type
  
  3. Trade Categories Added
    - Private Chef (hospitality)
    - Event Catering (hospitality)
    - Mobile Bar/Bartender (hospitality)
  
  4. Notes
    - Construction tradies: require license_number and/or white_card
    - Hospitality tradies: require food_safety_cert and/or cookery_cert
    - Trade type determines which verification fields are required
*/

DO $$
BEGIN
  -- Add trade_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'trade_type'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN trade_type text DEFAULT 'construction';
  END IF;

  -- Add food_safety_cert column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'food_safety_cert'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN food_safety_cert text DEFAULT '';
  END IF;

  -- Add cookery_cert column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'cookery_cert'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN cookery_cert text DEFAULT '';
  END IF;

  -- Add white_card column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'white_card'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN white_card text DEFAULT '';
  END IF;

  -- Add insurance_document_url column if it doesn't exist (for storing uploaded insurance docs)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'insurance_document_url'
  ) THEN
    ALTER TABLE tradie_details ADD COLUMN insurance_document_url text DEFAULT '';
  END IF;
END $$;

-- Add check constraint for trade_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tradie_details_trade_type_check'
  ) THEN
    ALTER TABLE tradie_details
    ADD CONSTRAINT tradie_details_trade_type_check
    CHECK (trade_type IN ('construction', 'hospitality'));
  END IF;
END $$;

-- Create index for trade_type for faster queries
CREATE INDEX IF NOT EXISTS idx_tradie_details_trade_type ON tradie_details(trade_type);