/*
  # Add callout fee visibility settings

  1. Modified Tables
    - `profiles`
      - `show_callout_fee` (boolean, default true) - Controls whether the callout fee is displayed to clients on the tradie card
      - `callout_fee_waived_on_proceed` (boolean, default false) - Indicates the callout fee is waived if the client proceeds with the job

  2. Notes
    - These fields give tradies control over how their callout fee is presented
    - Defaults to showing the fee (transparency by default)
    - Waiver option allows tradies to soften the price display
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'show_callout_fee'
  ) THEN
    ALTER TABLE profiles ADD COLUMN show_callout_fee boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'callout_fee_waived_on_proceed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN callout_fee_waived_on_proceed boolean DEFAULT false;
  END IF;
END $$;