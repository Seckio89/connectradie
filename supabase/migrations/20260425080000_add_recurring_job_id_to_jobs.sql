ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS recurring_job_id uuid REFERENCES recurring_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_recurring_job_id ON jobs(recurring_job_id);
