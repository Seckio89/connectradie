/*
  # Add Tradie Professional Profile Fields

  1. New Columns on `profiles`
    - `insurance_policy` (boolean, default false) - Whether tradie has public liability insurance
    - `service_radius_km` (integer, default 20) - How far the tradie will travel for jobs
    - `is_emergency_available` (boolean, default false) - Whether available for 24/7 emergency call-outs
    - `team_size` (text, nullable) - Solo / Small Team (2-5) / Large Team (6+)
    - `call_out_fee` (integer, nullable) - Standard call-out fee in dollars
    - `bio` (text, nullable) - Short business bio, max 140 characters

  2. Notes
    - abn_number and license_number already exist on profiles
    - These fields drive trust signals and the lead matching algorithm
    - Uses IF NOT EXISTS checks for safety
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'insurance_policy'
  ) THEN
    ALTER TABLE profiles ADD COLUMN insurance_policy boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'service_radius_km'
  ) THEN
    ALTER TABLE profiles ADD COLUMN service_radius_km integer DEFAULT 20;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_emergency_available'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_emergency_available boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'team_size'
  ) THEN
    ALTER TABLE profiles ADD COLUMN team_size text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'call_out_fee'
  ) THEN
    ALTER TABLE profiles ADD COLUMN call_out_fee integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE profiles ADD COLUMN bio text;
  END IF;
END $$;