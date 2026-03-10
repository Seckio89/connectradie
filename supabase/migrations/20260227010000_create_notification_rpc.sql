-- Create the create_notification RPC function
-- Called from: JobCompletionModal, Onboarding, Team pages
-- Allows authenticated users to create notifications for other users

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'message',
  p_channel text DEFAULT 'in_app',
  p_read boolean DEFAULT false,
  p_link text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO notifications (user_id, title, message, type, channel, read, link, job_id, metadata)
  VALUES (p_user_id, p_title, p_message, p_type, p_channel, p_read, p_link, p_job_id, p_metadata)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;
