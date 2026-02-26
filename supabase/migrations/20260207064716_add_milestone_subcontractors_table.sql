/*
  # Add milestone subcontractors table

  1. New Tables
    - `milestone_subcontractors`
      - `id` (uuid, primary key)
      - `milestone_id` (uuid, foreign key to job_milestones)
      - `business_name` (text) - Subcontractor business name
      - `invoice_number` (text, nullable) - Invoice/receipt reference
      - `amount` (numeric) - Amount to pay this subcontractor
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `milestone_subcontractors` table
    - Policies for authenticated users who own the related job (via milestone -> job -> tradie_id or client_id)

  3. Important Notes
    - Allows multiple subcontractors per milestone instead of a single one
    - Each subcontractor has their own business name, invoice number, and amount
    - The existing single-subcontractor columns on job_milestones are kept for backward compatibility
*/

CREATE TABLE IF NOT EXISTS milestone_subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES job_milestones(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  invoice_number text DEFAULT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE milestone_subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subcontractors for their job milestones"
  ON milestone_subcontractors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_milestones jm
      JOIN jobs j ON j.id = jm.job_id
      WHERE jm.id = milestone_subcontractors.milestone_id
      AND (j.tradie_id = auth.uid() OR j.client_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert subcontractors for their job milestones"
  ON milestone_subcontractors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_milestones jm
      JOIN jobs j ON j.id = jm.job_id
      WHERE jm.id = milestone_subcontractors.milestone_id
      AND (j.tradie_id = auth.uid() OR j.client_id = auth.uid())
    )
  );

CREATE POLICY "Users can update subcontractors for their job milestones"
  ON milestone_subcontractors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_milestones jm
      JOIN jobs j ON j.id = jm.job_id
      WHERE jm.id = milestone_subcontractors.milestone_id
      AND (j.tradie_id = auth.uid() OR j.client_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_milestones jm
      JOIN jobs j ON j.id = jm.job_id
      WHERE jm.id = milestone_subcontractors.milestone_id
      AND (j.tradie_id = auth.uid() OR j.client_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete subcontractors for their job milestones"
  ON milestone_subcontractors
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_milestones jm
      JOIN jobs j ON j.id = jm.job_id
      WHERE jm.id = milestone_subcontractors.milestone_id
      AND (j.tradie_id = auth.uid() OR j.client_id = auth.uid())
    )
  );
