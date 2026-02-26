/*
  # Add ABN Entity Name to Profiles

  1. Modified Tables
    - `profiles`
      - `abn_entity_name` (text, nullable) - The registered business/entity name returned by ABR lookup
      - `abn_verified` (boolean, default false) - Whether the ABN has been algorithmically + API verified

  2. Notes
    - Stores the business name returned from the Australian Business Register API
    - `abn_verified` is set to true only after the verify-abn edge function confirms the ABN
    - These fields support the real ABN verification flow replacing the stub logic
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'abn_entity_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN abn_entity_name text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'abn_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN abn_verified boolean DEFAULT false;
  END IF;
END $$;