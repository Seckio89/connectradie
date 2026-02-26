/*
  # Add Job Variations (Change Orders) System

  1. New Tables
    - `job_variations`
      - `id` (uuid, primary key) - Unique identifier for the variation
      - `job_id` (uuid, foreign key) - References the job this variation applies to
      - `description` (text) - Reason for the variation (e.g., "Client requested extra power points")
      - `additional_amount` (numeric) - The extra cost being requested
      - `status` (text) - Current status: 'pending', 'approved', or 'rejected'
      - `created_at` (timestamptz) - When the variation was created
      - `updated_at` (timestamptz) - When the variation status was last updated

  2. Security
    - Enable RLS on `job_variations` table
    - Tradies can create variations for their own jobs
    - Tradies can view variations for their own jobs
    - Clients can view variations for their own jobs
    - Clients can update (approve/reject) variations for their own jobs
*/

-- Create the job_variations table
CREATE TABLE IF NOT EXISTS job_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  additional_amount numeric(10, 2) NOT NULL CHECK (additional_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE job_variations ENABLE ROW LEVEL SECURITY;

-- Policy: Tradies can insert variations for jobs they are assigned to
CREATE POLICY "Tradies can create variations for their jobs"
  ON job_variations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Policy: Tradies can view variations for their jobs
CREATE POLICY "Tradies can view variations for their jobs"
  ON job_variations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Policy: Clients can view variations for their jobs
CREATE POLICY "Clients can view variations for their jobs"
  ON job_variations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Policy: Clients can update variations for their jobs (approve/reject)
CREATE POLICY "Clients can update variations for their jobs"
  ON job_variations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
      AND jobs.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_variations.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_variations_job_id ON job_variations(job_id);
CREATE INDEX IF NOT EXISTS idx_job_variations_status ON job_variations(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_variations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS job_variations_updated_at ON job_variations;
CREATE TRIGGER job_variations_updated_at
  BEFORE UPDATE ON job_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_job_variations_updated_at();