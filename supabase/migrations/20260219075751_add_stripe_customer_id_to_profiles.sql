/*
  # Add stripe_customer_id to profiles

  1. Changes
    - Add `stripe_customer_id` column to `profiles` table
      - Stores the Stripe customer ID for each user
      - Used by the webhook to look up which profile to update after payment events
      - Nullable since not all users will have a Stripe customer

  2. Notes
    - This is required for the stripe-webhook to map Stripe customer IDs back to user profiles
    - The create-checkout-session function will also populate this after creating a customer
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_customer_id text UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);
