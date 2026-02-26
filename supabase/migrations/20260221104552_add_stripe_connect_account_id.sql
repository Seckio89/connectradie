/*
  # Add Stripe Connect account ID to profiles

  1. Modified Tables
    - `profiles`
      - `stripe_connect_account_id` (text, nullable) - Stores the Stripe Connect account ID for tradies to receive payouts
      - `stripe_connect_onboarding_complete` (boolean, default false) - Tracks whether the tradie has completed Stripe Connect onboarding

  2. Important Notes
    - Only tradies will use these fields
    - The stripe_connect_account_id is set when a tradie starts the Stripe Connect onboarding flow
    - stripe_connect_onboarding_complete is set to true once Stripe confirms the account is fully onboarded
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stripe_connect_account_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_connect_account_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stripe_connect_onboarding_complete'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_connect_onboarding_complete boolean DEFAULT false;
  END IF;
END $$;
