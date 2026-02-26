/*
  # Add Business Subscription Tier

  ## Summary
  Extends the subscription tier system to support a new "business" tier in addition to the existing "free" and "pro" tiers.

  ## Changes
  1. Modified Tables
    - `tradie_details`: Updates the subscription_tier column constraint to allow 'business' as a valid value
  
  ## Notes
  - Existing 'free' and 'pro' values are preserved
  - No data is modified, only the constraint is updated
*/

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
      CHECK (subscription_tier IN ('free', 'pro', 'business'));
  END IF;
END $$;
