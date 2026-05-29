-- Scope conversations to a specific recurring job so each service gets its own chat thread
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS recurring_job_id uuid REFERENCES recurring_jobs(id) ON DELETE SET NULL;

-- Index for fast lookup by recurring_job_id
CREATE INDEX IF NOT EXISTS idx_conversations_recurring_job_id ON conversations(recurring_job_id) WHERE recurring_job_id IS NOT NULL;
