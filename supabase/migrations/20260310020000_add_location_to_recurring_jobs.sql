-- Add location column to recurring_jobs for service address
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS location text;
