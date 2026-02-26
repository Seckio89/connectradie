/*
  # Fix Jobs Project ID Update Policy

  1. Changes
    - Drop and recreate the update policy for jobs table to ensure clients can update project_id
    - The policy explicitly allows clients to update their own jobs without restrictions
    
  2. Security
    - Maintains that only the job owner (client) or assigned tradie can update the job
    - Ensures clients can freely manage project assignments for their jobs
*/

-- Drop the existing update policy
DROP POLICY IF EXISTS "Both parties can update jobs" ON jobs;

-- Recreate the update policy with explicit permissions
CREATE POLICY "Both parties can update jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid() OR tradie_id = auth.uid())
  WITH CHECK (client_id = auth.uid() OR tradie_id = auth.uid());