/*
  # Add DELETE policy for jobs table
  
  1. Changes
    - Add DELETE policy allowing tradies to delete jobs they have declined
    - Ensures only declined jobs can be deleted by the tradie
  
  2. Security
    - Only the assigned tradie can delete their own jobs
    - Only jobs with status 'declined' can be deleted
*/

CREATE POLICY "Tradies can delete their declined jobs"
  ON jobs FOR DELETE
  TO authenticated
  USING (
    auth.uid() = tradie_id 
    AND status = 'declined'
  );