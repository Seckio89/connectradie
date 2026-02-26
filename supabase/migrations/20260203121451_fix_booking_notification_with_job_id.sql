/*
  # Fix Booking Request Notification to Include Job ID

  1. Changes
    - Update the `notify_booking_request` function to include job_id in metadata
    - Include scheduled_time from the linked job if available
    - Provide more detailed notification message with booking time

  2. Security
    - No changes to RLS policies
    - Function maintains existing behavior with enhanced metadata
*/

-- Drop and recreate the function with job_id support
CREATE OR REPLACE FUNCTION notify_booking_request()
RETURNS TRIGGER AS $$
DECLARE
  sender_name text;
  job_scheduled_time timestamptz;
BEGIN
  -- Only create notification if it's a booking request
  IF NEW.is_booking_request = true THEN
    -- Get sender's name
    SELECT full_name INTO sender_name
    FROM profiles
    WHERE id = NEW.sender_id;

    -- Get job scheduled time if job_id exists
    IF NEW.job_id IS NOT NULL THEN
      SELECT scheduled_time INTO job_scheduled_time
      FROM jobs
      WHERE id = NEW.job_id;
    END IF;

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
      CASE
        WHEN job_scheduled_time IS NOT NULL THEN
          sender_name || ' has requested a booking for ' ||
          to_char(job_scheduled_time AT TIME ZONE 'Australia/Sydney', 'Day, DD Month YYYY at HH24:MI')
        ELSE
          sender_name || ' sent you a booking request'
      END,
      'booking_request',
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'sender_id', NEW.sender_id,
        'job_id', NEW.job_id,
        'scheduled_time', job_scheduled_time
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;