/*
  # Add Verification Center Fields to Profiles

  1. Modified Tables
    - `profiles`
      - `license_expiry` (date, nullable) - Expiry date for trade license
      - `verification_status` (text, default 'unverified') - Tracks verification workflow: unverified, pending, verified, rejected
      - `documents_url` (text[], default '{}') - Array of uploaded document URLs (license photos, ID documents)

  2. Security
    - CHECK constraint on verification_status to enforce valid states
    - Existing RLS policies on profiles table continue to apply

  3. Notes
    - The profiles table already has `abn_number` and `license_number` columns from a previous migration
    - `verification_status` replaces the boolean `is_verified` on `tradie_details` for a more granular workflow
    - Documents are stored as URL references to files in Supabase Storage
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_expiry'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_expiry date DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN verification_status text DEFAULT 'unverified'
      CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'documents_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN documents_url text[] DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE profiles ADD COLUMN rejection_reason text DEFAULT NULL;
  END IF;
END $$;