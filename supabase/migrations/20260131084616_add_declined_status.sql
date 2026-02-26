/*
  # Add 'declined' status to jobs

  1. Changes
    - Drop existing status check constraint
    - Add new constraint that includes 'declined' status
  
  2. Notes
    - This allows tradies to decline jobs
    - Existing data is preserved
*/

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'declined'::text]));
