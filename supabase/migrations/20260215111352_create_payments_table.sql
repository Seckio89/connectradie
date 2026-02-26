/*
  # Create payments table for one-time Stripe payments

  1. New Tables
    - `payments`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, references profiles)
      - `stripe_payment_intent_id` (text, unique)
      - `stripe_checkout_session_id` (text, unique)
      - `payment_type` (text) - 'lead_unlock' or 'job_access'
      - `job_id` (uuid, references jobs)
      - `amount` (integer) - amount in cents
      - `currency` (text, default 'aud')
      - `status` (text) - 'pending', 'completed', 'failed', 'refunded'
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)

  2. Security
    - Enable RLS on `payments` table
    - Users can only view their own payments
*/

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  payment_type text NOT NULL CHECK (payment_type IN ('lead_unlock', 'job_access')),
  job_id uuid REFERENCES jobs(id),
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'aud',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON payments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert own payments"
  ON payments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);
