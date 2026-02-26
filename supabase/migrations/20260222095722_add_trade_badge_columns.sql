/*
  # Add Dynamic Trade Badge Columns

  1. Modified Tables
    - `profiles`
      - `declared_trades` (text[]): Trades declared during sign-up (e.g., ['Plumbing', 'Gas Fitting']). Default empty array.
      - `verified_trades` (text[]): Trades verified via approved license certificates. Default empty array.
      - `license_trades` (text[]): Trades selected when submitting a license for verification. Default empty array.

  2. Notes
    - declared_trades is populated during onboarding when the tradie selects their trade category
    - license_trades is populated when a tradie submits a license and selects which trades it covers
    - verified_trades is populated by admin approval workflow, appending trades from the approved license
    - All columns default to empty arrays to avoid null handling
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'declared_trades'
  ) THEN
    ALTER TABLE profiles ADD COLUMN declared_trades text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'verified_trades'
  ) THEN
    ALTER TABLE profiles ADD COLUMN verified_trades text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'license_trades'
  ) THEN
    ALTER TABLE profiles ADD COLUMN license_trades text[] DEFAULT '{}';
  END IF;
END $$;
