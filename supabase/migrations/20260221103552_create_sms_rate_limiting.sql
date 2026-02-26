/*
  # Create SMS rate limiting system

  1. New Tables
    - `sms_send_log`
      - `id` (uuid, primary key)
      - `phone_number` (text, not null) - normalised phone number
      - `notification_type` (text) - the type of notification that triggered the SMS
      - `sent_at` (timestamptz, defaults to now()) - when the SMS was dispatched

  2. Security
    - Enable RLS on `sms_send_log` table
    - Only service_role can read/write (edge functions use service role key)

  3. Indexes
    - Composite index on (phone_number, sent_at) for efficient rate-limit lookups

  4. Notes
    - This table is used by the send-sms edge function to enforce a daily per-number SMS cap
    - Prevents runaway costs from bugs or loops hitting the Twilio API
*/

CREATE TABLE IF NOT EXISTS sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  notification_type text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sms_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sms_send_log"
  ON sms_send_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sms_send_log_phone_day
  ON sms_send_log (phone_number, sent_at);
