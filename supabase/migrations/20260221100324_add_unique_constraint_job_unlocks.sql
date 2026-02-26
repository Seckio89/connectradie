/*
  # Add unique constraint on job_unlocks for idempotent offline sync

  1. Problem
    - Offline sync could replay job_unlock inserts causing duplicates
    - No unique constraint existed on (tradie_id, job_id) pair

  2. Solution
    - Add unique constraint on (tradie_id, job_id) to prevent duplicates
    - Allows the offline sync to use `on_conflict=tradie_id,job_id` with
      `resolution=ignore-duplicates` for safe replays
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_unlocks_tradie_job_unique'
  ) THEN
    ALTER TABLE job_unlocks
    ADD CONSTRAINT job_unlocks_tradie_job_unique UNIQUE (tradie_id, job_id);
  END IF;
END $$;
