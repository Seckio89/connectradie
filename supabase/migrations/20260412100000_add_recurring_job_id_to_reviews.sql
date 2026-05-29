-- Add recurring_job_id to reviews so clients can review ongoing services
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS recurring_job_id uuid REFERENCES recurring_jobs(id) ON DELETE SET NULL;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_reviews_recurring_job_id ON reviews(recurring_job_id) WHERE recurring_job_id IS NOT NULL;
