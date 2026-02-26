/*
  # Fix missing database columns and broken RPC

  1. Missing columns added to `jobs`
    - `preferred_time_slot` (text, nullable) - morning/midday/afternoon preference
    - `emergency_fee_applied` (boolean, default false) - whether emergency fee applies
    - `updated_at` (timestamptz, default now()) - last update timestamp

  2. Missing columns added to `payments`
    - `metadata` (jsonb, default '{}') - arbitrary payment metadata

  3. Missing columns added to `notifications`
    - `link` (text, nullable) - navigation link for the notification
    - `job_id` (uuid, nullable, FK to jobs) - associated job

  4. CHECK constraint fixes
    - `payments.payment_type` - add 'job_funding' to allowed values
    - `jobs.status` - add 'funded' to allowed values

  5. RPC fix
    - Recreate `simulate_payment_success` to work with corrected schema
*/

-- 1. Add missing columns to jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'preferred_time_slot'
  ) THEN
    ALTER TABLE jobs ADD COLUMN preferred_time_slot text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'emergency_fee_applied'
  ) THEN
    ALTER TABLE jobs ADD COLUMN emergency_fee_applied boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Add metadata column to payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE payments ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 3. Add link and job_id columns to notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'link'
  ) THEN
    ALTER TABLE notifications ADD COLUMN link text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'job_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN job_id uuid REFERENCES jobs(id);
  END IF;
END $$;

-- 4. Fix payments.payment_type CHECK constraint to include 'job_funding'
DO $$
BEGIN
  ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
  ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check
    CHECK (payment_type IN ('lead_unlock', 'job_access', 'job_funding'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 5. Fix jobs status CHECK constraint to include 'funded'
DO $$
BEGIN
  ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
  ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status = ANY (ARRAY['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined', 'funded']));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 6. Recreate the simulate_payment_success RPC with corrected schema
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_job_record
  FROM jobs
  WHERE id = target_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_job_record.client_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this job';
  END IF;

  UPDATE jobs
  SET
    status = 'funded',
    updated_at = now()
  WHERE id = target_job_id;

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

  IF v_job_record.tradie_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      job_id,
      metadata
    ) VALUES (
      v_job_record.tradie_id,
      'payment',
      'Escrow Funded (Training Mode)',
      'The client has funded the escrow for this job. This is a simulated payment for training purposes.',
      '/jobs',
      target_job_id,
      jsonb_build_object('simulated', true)
    );
  END IF;

  v_result := json_build_object(
    'success', true,
    'job_id', target_job_id,
    'payment_id', v_payment_id,
    'message', 'Payment simulated successfully'
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION simulate_payment_success(uuid) TO authenticated;
