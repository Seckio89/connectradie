/*
  # Add License State and Verification Fields

  1. Changes
    - Add `license_state` column to store the Australian state/territory where the license was issued
    - Add `license_verified` boolean flag to track if the license has been verified
  
  2. Details
    - `license_state` stores values like NSW, VIC, QLD, SA, WA, TAS, NT, ACT
    - `license_verified` defaults to false and is set to true after verification
    - Both columns are nullable to support profiles without license information
  
  3. Notes
    - Uses IF NOT EXISTS pattern to safely add columns if they don't already exist
    - Default values ensure backward compatibility with existing profiles
*/

-- Add license_state column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_state'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_state text DEFAULT NULL;
  END IF;
END $$;

-- Add license_verified column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_verified boolean DEFAULT false;
  END IF;
END $$;

-- Add check constraint for valid Australian states/territories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_license_state_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_license_state_check
      CHECK (license_state IS NULL OR license_state IN ('NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'));
  END IF;
END $$;