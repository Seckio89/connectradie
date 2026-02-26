/*
  # Fix simulate_payment_success RPC and training mode

  1. Bug Fixes
    - The `simulate_payment_success` RPC was querying non-existent columns
      (`enabled`, `key`) on `system_settings` table. Fixed to read from
      `app_settings` table using key `training_mode_enabled`.
    - The previous RPC would crash at runtime with a column-not-found error.

  2. Changes
    - Drops and recreates `simulate_payment_success` function
    - Now reads training mode from `app_settings` (where the admin toggle writes)
    - Grants EXECUTE to authenticated users

  3. Security
    - Function remains SECURITY DEFINER to bypass RLS for payment simulation
    - Training mode check ensures this only works when training mode is enabled
*/

DROP FUNCTION IF EXISTS simulate_payment_success(uuid);

CREATE FUNCTION simulate_payment_success(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_mode boolean;
  v_client_id uuid;
BEGIN
  SELECT (value::boolean) INTO v_training_mode
  FROM app_settings
  WHERE key = 'training_mode_enabled';

  IF v_training_mode IS NOT TRUE THEN
    RAISE EXCEPTION 'Training mode is not active. Cannot simulate payment.';
  END IF;

  SELECT client_id INTO v_client_id
  FROM jobs
  WHERE id = p_job_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;

  UPDATE jobs
  SET status = 'funded'
  WHERE id = p_job_id;

  INSERT INTO payments (job_id, payer_id, amount, payment_type, stripe_session_id, status, metadata)
  VALUES (
    p_job_id,
    v_client_id,
    0,
    'job_funding',
    'simulated_' || gen_random_uuid()::text,
    'completed',
    jsonb_build_object('simulated', true, 'training_mode', true)
  );

  INSERT INTO notifications (user_id, title, message, type, notification_type, channel, metadata, link, job_id)
  VALUES (
    v_client_id,
    'Escrow Funded (Test)',
    'Simulated payment completed for your job.',
    'payment_received',
    'PAYMENT_RECEIVED',
    'in_app',
    jsonb_build_object('simulated', true),
    '/jobs',
    p_job_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION simulate_payment_success(uuid) TO authenticated;
