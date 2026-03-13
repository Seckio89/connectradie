-- Add completed_at timestamp to jobs table for auto-release countdown
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: set completed_at = updated_at for already-completed jobs
UPDATE jobs SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;
