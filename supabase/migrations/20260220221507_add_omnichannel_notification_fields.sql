/*
  # Add Omni-Channel Notification Fields

  1. Modified Tables
    - `notifications`
      - `read_at` (timestamptz, nullable) - Exact timestamp when notification was read (for unread badge)
      - `channel` (text, default 'in_app') - Which channel delivered this notification (in_app, sms, email)
      - `notification_type` (text, nullable) - Structured type for routing (e.g. TRADIE_ON_THE_WAY, VARIATION_REQUEST)
      - `sms_sent_at` (timestamptz, nullable) - When SMS was dispatched (null if not sent via SMS)
      - `email_sent_at` (timestamptz, nullable) - When email was dispatched (null if not sent via email)

  2. Performance
    - Add index on read_at for unread badge queries
    - Add index on notification_type for filtering

  3. Important Notes
    - The existing `read` boolean column is kept for backward compatibility
    - `read_at` provides the timestamp for when the notification was actually read
    - `channel` tracks the primary delivery channel used
    - `sms_sent_at` and `email_sent_at` track multi-channel delivery independently
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN read_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'channel'
  ) THEN
    ALTER TABLE notifications ADD COLUMN channel text NOT NULL DEFAULT 'in_app';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'notification_type'
  ) THEN
    ALTER TABLE notifications ADD COLUMN notification_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'sms_sent_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN sms_sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'email_sent_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN email_sent_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications(notification_type) WHERE notification_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
