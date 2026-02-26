/*
  # Create simulate_payment_success RPC function for Training Mode

  1. Purpose
    - Simulates successful payment/escrow funding without calling real Stripe API
    - Used when Training Mode is active to allow testing payment flows safely

  2. Changes
    - Creates RPC function `simulate_payment_success(target_job_id uuid)`
    - Updates job status to 'funded'
    - Creates payment record marked as simulated
    - Creates notification for tradie

  3. Security
    - Restricted to authenticated users only
    - Validates that the user is the client who owns the job
*/

-- Create the simulate_payment_success function
CREATE OR REPLACE FUNCTION simulate_payment_success(target_job_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_record jobs%ROWTYPE;
  v_payment_id uuid;
  v_result json;
BEGIN
  -- Get the current user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the job and verify ownership
  SELECT * INTO v_job_record
  FROM jobs
  WHERE id = target_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_job_record.client_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this job';
  END IF;

  -- Update job status to funded
  UPDATE jobs
  SET
    status = 'funded',
    updated_at = now()
  WHERE id = target_job_id;

  -- Insert simulated payment record
  INSERT INTO payments (
    profile_id,
    job_id,
    payment_type,
    amount,
    currency,
    status,
    stripe_payment_intent_id,
    metadata
  ) VALUES (
    auth.uid(),
    target_job_id,
    'job_funding',
    COALESCE(v_job_record.budget_amount, 0),
    'aud',
    'completed',
    'simulated_' || gen_random_uuid()::text,
    jsonb_build_object(
      'simulated', true,
      'training_mode', true,
      'simulated_at', now()
    )
  )
  RETURNING id INTO v_payment_id;

  -- Create notification for the tradie
  IF v_job_record.tradie_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      job_id
    ) VALUES (
      v_job_record.tradie_id,
      'payment',
      'Escrow Funded (Training Mode)',
      'The client has funded the escrow for this job. This is a simulated payment for training purposes.',
      '/jobs',
      target_job_id
    );
  END IF;

  -- Build result
  v_result := json_build_object(
    'success', true,
    'job_id', target_job_id,
    'payment_id', v_payment_id,
    'message', 'Payment simulated successfully'
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION simulate_payment_success(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION simulate_payment_success IS 'Simulates successful payment for a job when Training Mode is active. Creates payment record and updates job status without calling Stripe.';
