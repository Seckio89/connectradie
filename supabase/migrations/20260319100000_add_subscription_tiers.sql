/*
  # Add Subscription Tiers

  ## Summary
  Extends the subscription tier system with new tradie tiers (pro_plus) and
  property manager tiers, and adds subscription metadata columns to profiles.

  ## Changes
  1. Creates subscription_tier enum type (if not already an enum)
  2. Adds subscription_tier, subscription_started_at, subscription_expires_at
     to profiles table if not already present
  3. Extends tradie_details subscription_tier constraint to include pro_plus

  ## Notes
  - Preserves all existing 'free', 'pro', 'business' values
  - Uses IF NOT EXISTS / DO blocks for safe re-run
*/

-- Extend tradie_details subscription_tier to include pro_plus
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tradie_details' AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE tradie_details
      DROP CONSTRAINT IF EXISTS tradie_details_subscription_tier_check;

    ALTER TABLE tradie_details
      ADD CONSTRAINT tradie_details_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro', 'pro_plus', 'business'));
  END IF;
END $$;

-- Add subscription_tier column to profiles if not present
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text
    DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'pro_plus', 'pm_starter', 'pm_pro', 'pm_enterprise'));

-- Add subscription metadata columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
