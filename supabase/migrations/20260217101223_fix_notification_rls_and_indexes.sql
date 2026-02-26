/*
  # Fix Notification RLS Policy and Add Missing Indexes

  1. Security Changes
    - Fix notification INSERT policy: allow authenticated users to create notifications 
      for ANY user (not just themselves). This is needed for cross-user notifications
      like booking requests, variation requests, and calendar events.
    - Add rate limiting RLS to contact_messages: restrict anonymous inserts to 
      prevent spam abuse.
    - Fix simulate_payment_success RPC: add training mode validation check.

  2. Performance
    - Add missing indexes on frequently queried columns:
      - jobs.project_id
      - jobs.is_flash_boost
      - jobs.scheduled_date
      - job_variations.job_id
      - milestone_subcontractors.milestone_id
      - date_change_requests.project_id

  3. Important Notes
    - The notification INSERT policy previously required user_id = auth.uid(),
      which silently blocked all cross-user notification inserts from the frontend.
    - The new policy allows any authenticated user to insert notifications,
      but SELECT/UPDATE/DELETE remain restricted to the notification owner.
*/

-- Fix notification INSERT policy to allow cross-user notifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can create own notifications'
  ) THEN
    DROP POLICY "Users can create own notifications" ON notifications;
  END IF;
END $$;

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add rate limiting for contact_messages
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contact_messages' AND policyname = 'Anyone can insert contact messages'
  ) THEN
    DROP POLICY "Anyone can insert contact messages" ON contact_messages;
  END IF;
END $$;

CREATE POLICY "Authenticated users can submit contact messages"
  ON contact_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT count(*) FROM contact_messages cm 
     WHERE cm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
     AND cm.created_at > now() - interval '1 hour') < 10
  );

CREATE POLICY "Anonymous users can submit limited contact messages"
  ON contact_messages FOR INSERT
  TO anon
  WITH CHECK (
    (SELECT count(*) FROM contact_messages cm 
     WHERE cm.created_at > now() - interval '1 hour') < 20
  );

-- Add missing indexes for query performance
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_is_flash_boost ON jobs(is_flash_boost) WHERE is_flash_boost = true;
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_variations_job_id ON job_variations(job_id);
CREATE INDEX IF NOT EXISTS idx_date_change_requests_project_id ON date_change_requests(project_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'milestone_subcontractors'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_milestone_subcontractors_milestone_id ON milestone_subcontractors(milestone_id);
  END IF;
END $$;

-- Fix simulate_payment_success to check training mode is active
DROP FUNCTION IF EXISTS simulate_payment_success(uuid);

CREATE FUNCTION simulate_payment_success(p_job_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_training_mode boolean;
BEGIN
  SELECT enabled INTO v_training_mode
  FROM system_settings
  WHERE key = 'training_mode';

  IF v_training_mode IS NULL OR v_training_mode = false THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Training mode is not enabled. Real payments are required.'
    );
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Job not found');
  END IF;

  IF v_job.client_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE jobs SET status = 'funded' WHERE id = p_job_id;

  INSERT INTO payments (profile_id, job_id, payment_type, amount, currency, status, completed_at, metadata)
  VALUES (
    auth.uid(),
    p_job_id,
    'job_funding',
    0,
    'aud',
    'completed',
    now(),
    jsonb_build_object('simulated', true, 'training_mode', true)
  );

  INSERT INTO notifications (user_id, type, title, message, metadata)
  VALUES (
    v_job.tradie_id,
    'payment_received',
    'Payment Received (Training)',
    'A simulated payment has been made for your job.',
    jsonb_build_object('job_id', p_job_id)
  );

  RETURN json_build_object('success', true, 'message', 'Payment simulated successfully');
END;
$$;
