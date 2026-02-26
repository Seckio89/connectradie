/*
  # Create Notifications System

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `title` (text) - Notification title
      - `message` (text) - Notification message
      - `type` (text) - Type of notification (booking_request, message, etc.)
      - `read` (boolean) - Whether notification has been read
      - `created_at` (timestamptz) - When notification was created
      - `metadata` (jsonb) - Additional data (conversation_id, message_id, etc.)

  2. Security
    - Enable RLS on notifications table
    - Users can only view their own notifications
    - Users can only update their own notifications (to mark as read)
    - System can create notifications for any user

  3. Triggers
    - Auto-create notification when booking request message is sent
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'message',
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Function to create notification for booking request
CREATE OR REPLACE FUNCTION notify_booking_request()
RETURNS TRIGGER AS $$
DECLARE
  sender_name text;
BEGIN
  -- Only create notification if it's a booking request
  IF NEW.is_booking_request = true THEN
    -- Get sender's name
    SELECT full_name INTO sender_name
    FROM profiles
    WHERE id = NEW.sender_id;

    -- Create notification for the receiver
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    ) VALUES (
      NEW.receiver_id,
      'New Booking Request',
      sender_name || ' sent you a booking request',
      'booking_request',
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'sender_id', NEW.sender_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for booking request notifications
DROP TRIGGER IF EXISTS on_booking_request_message ON messages;
CREATE TRIGGER on_booking_request_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_request();