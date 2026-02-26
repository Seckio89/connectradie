/*
  # Add Job Unlocks Table for Pay-to-Access System

  1. New Tables
    - `job_unlocks`
      - `id` (uuid, primary key)
      - `tradie_id` (uuid, references profiles) - The tradie who unlocked
      - `job_id` (uuid, references jobs) - The job being unlocked
      - `unlocked_at` (timestamptz) - When the job was unlocked
      - `amount_paid` (numeric) - Amount paid for unlock (2.99)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `job_unlocks` table
    - Add policy for tradies to view their own job unlocks
    - Add policy for tradies to create job unlocks
*/

CREATE TABLE IF NOT EXISTS job_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  amount_paid numeric(10,2) DEFAULT 2.99,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tradie_id, job_id)
);

ALTER TABLE job_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tradies can view own job unlocks"
  ON job_unlocks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

CREATE POLICY "Tradies can create job unlocks"
  ON job_unlocks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

CREATE INDEX IF NOT EXISTS idx_job_unlocks_tradie_id ON job_unlocks(tradie_id);
CREATE INDEX IF NOT EXISTS idx_job_unlocks_job_id ON job_unlocks(job_id);