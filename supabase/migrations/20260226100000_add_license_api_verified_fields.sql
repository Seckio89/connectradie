/*
  # Add License API Verification Fields to Profiles

  1. Modified Tables
    - `profiles`
      - `license_holder_name` (text, nullable) - Holder name returned by state licensing authority
      - `license_api_verified` (boolean, default false) - Whether license was verified via authority API
      - `license_class` (text, nullable) - License class/category from the authority

  2. Notes
    - Stores enriched data returned from state licensing authority APIs (QLD, NSW, VIC)
    - `license_api_verified` distinguishes API-verified licenses from format-only validation
    - Follows the same pattern as `abn_entity_name` / `abn_verified` fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_holder_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_holder_name text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_api_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_api_verified boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_class'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_class text DEFAULT NULL;
  END IF;
END $$;
