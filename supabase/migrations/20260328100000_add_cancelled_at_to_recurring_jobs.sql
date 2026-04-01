-- Add cancelled_at to distinguish permanently cancelled services from paused ones
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
