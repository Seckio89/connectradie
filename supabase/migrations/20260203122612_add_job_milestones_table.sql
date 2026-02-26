/*
  # Create Job Milestones Payment System

  ## Overview
  This migration creates a milestone payment system for jobs, allowing tradies to request payment in stages
  and clients to approve and mark milestones as paid.

  ## New Tables
  1. `job_milestones`
    - `id` (uuid, primary key) - Unique identifier for the milestone
    - `job_id` (uuid, foreign key) - References the job this milestone belongs to
    - `title` (text) - Description of the milestone (e.g., "Deposit", "Materials Purchase", "Final Payment")
    - `amount` (numeric) - Payment amount for this milestone
    - `status` (text) - Payment status: 'pending', 'approved', 'paid'
    - `due_date` (date, nullable) - Optional due date for the milestone
    - `created_at` (timestamptz) - When the milestone was created
    - `updated_at` (timestamptz) - Last update timestamp
    - `created_by` (uuid) - User who created the milestone (typically the tradie)
    - `approved_at` (timestamptz, nullable) - When the milestone was approved
    - `paid_at` (timestamptz, nullable) - When the milestone was marked as paid

  ## Security
  - Enable RLS on `job_milestones` table
  - Tradies can create milestones for their jobs
  - Tradies can view milestones for their jobs
  - Tradies can update pending milestones for their jobs
  - Clients can view milestones for their jobs
  - Clients can update milestone status to approve or mark as paid
  - Clients cannot modify milestone amounts or delete milestones

  ## Constraints
  - Milestone status must be one of: 'pending', 'approved', 'paid'
  - Amount must be positive
  - Foreign key constraint ensures job_id exists
*/

-- Create job_milestones table
CREATE TABLE IF NOT EXISTS job_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  due_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_milestones_job_id ON job_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_job_milestones_status ON job_milestones(status);
CREATE INDEX IF NOT EXISTS idx_job_milestones_created_by ON job_milestones(created_by);

-- Enable RLS
ALTER TABLE job_milestones ENABLE ROW LEVEL SECURITY;

-- Tradies can create milestones for their own jobs
CREATE POLICY "Tradies can create milestones for their jobs"
  ON job_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Tradies can view milestones for their jobs
CREATE POLICY "Tradies can view milestones for their jobs"
  ON job_milestones FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Clients can view milestones for their jobs
CREATE POLICY "Clients can view milestones for their jobs"
  ON job_milestones FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Tradies can update pending milestones for their jobs
CREATE POLICY "Tradies can update pending milestones"
  ON job_milestones FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.tradie_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Clients can approve or mark milestones as paid for their jobs
CREATE POLICY "Clients can approve or pay milestones"
  ON job_milestones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Tradies can delete pending milestones for their jobs
CREATE POLICY "Tradies can delete pending milestones"
  ON job_milestones FOR DELETE
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_milestones.job_id
      AND jobs.tradie_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_job_milestones_timestamp ON job_milestones;
CREATE TRIGGER update_job_milestones_timestamp
  BEFORE UPDATE ON job_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_job_milestones_updated_at();