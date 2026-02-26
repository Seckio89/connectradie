/*
  # Add ABN and License Number to Profiles

  1. Modified Tables
    - `profiles`
      - `abn_number` (text, nullable) - Australian Business Number for tradies
      - `license_number` (text, nullable) - Trade license number for tradies

  2. Notes
    - These fields support the onboarding checklist for tradie users
    - Both fields are optional and nullable
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'abn_number'
  ) THEN
    ALTER TABLE profiles ADD COLUMN abn_number text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_number'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_number text DEFAULT NULL;
  END IF;
END $$;