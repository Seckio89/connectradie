/*
  # Add Notification Preferences

  1. Modified Tables
    - `profiles`
      - `push_enabled` (boolean, default false) - whether web push alerts are enabled
      - `sms_alerts_enabled` (boolean, default false) - whether SMS alerts for urgent jobs are enabled
      - `push_subscription` (jsonb, nullable) - stores the PushSubscription object from the browser

  2. Important Notes
    - These fields allow tradies to control their notification preferences
    - SMS alerts are gated to Pro members only (enforced in application code)
    - push_subscription stores the browser PushManager subscription JSON for sending push notifications
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'push_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN push_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sms_alerts_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN sms_alerts_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'push_subscription'
  ) THEN
    ALTER TABLE profiles ADD COLUMN push_subscription jsonb;
  END IF;
END $$;
