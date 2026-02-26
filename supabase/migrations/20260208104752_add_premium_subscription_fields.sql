/*
  # Add Premium Subscription Fields to Profiles

  1. Modified Tables
    - `profiles`
      - `is_premium` (boolean, default false) - Whether the user has an active premium subscription
      - `subscription_expiry` (timestamptz, nullable) - When the premium subscription expires

  2. Security
    - Existing RLS policies on profiles continue to apply
    - Users can read their own premium status
    - Premium status is updated through authenticated operations

  3. Notes
    - The `tradie_details.subscription_tier` field continues to store the plan type ('free' | 'pro')
    - `profiles.is_premium` provides a quick boolean check for premium features
    - `subscription_expiry` enables time-based subscription management
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_premium boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'subscription_expiry'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_expiry timestamptz;
  END IF;
END $$;
