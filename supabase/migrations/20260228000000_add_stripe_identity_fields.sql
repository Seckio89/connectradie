/*
  # Add Stripe Identity KYC fields

  Adds columns to support Stripe Identity verification sessions:
  - stripe_identity_session_id: tracks the active VerificationSession
  - is_identity_verified: boolean flag set by webhook on successful verification
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_identity_session_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_identity_verified boolean NOT NULL DEFAULT false;
