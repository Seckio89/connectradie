-- Add ON DELETE CASCADE to FK references to jobs(id) that currently lack it.
-- This allows job deletion without manual child-row cleanup from the client,
-- which was failing due to RLS policies blocking DELETE on child tables.

-- service_reminders: job_id NOT NULL REFERENCES jobs(id) → add CASCADE
ALTER TABLE service_reminders DROP CONSTRAINT IF EXISTS service_reminders_job_id_fkey;
ALTER TABLE service_reminders
  ADD CONSTRAINT service_reminders_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- payments: job_id REFERENCES jobs(id) → add CASCADE
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_job_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- disputes: job_id NOT NULL REFERENCES jobs(id) → add CASCADE
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_job_id_fkey;
ALTER TABLE disputes
  ADD CONSTRAINT disputes_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- notifications: job_id REFERENCES jobs(id) → add CASCADE
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_job_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- time_entries: job_id REFERENCES jobs(id) → add CASCADE
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_job_id_fkey;
ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- recurring_jobs: original_job_id REFERENCES jobs(id) → SET NULL on delete
ALTER TABLE recurring_jobs DROP CONSTRAINT IF EXISTS recurring_jobs_original_job_id_fkey;
ALTER TABLE recurring_jobs
  ADD CONSTRAINT recurring_jobs_original_job_id_fkey
  FOREIGN KEY (original_job_id) REFERENCES jobs(id) ON DELETE SET NULL;

-- service_agreements: original_job_id REFERENCES jobs(id) → SET NULL on delete
ALTER TABLE service_agreements DROP CONSTRAINT IF EXISTS service_agreements_original_job_id_fkey;
ALTER TABLE service_agreements
  ADD CONSTRAINT service_agreements_original_job_id_fkey
  FOREIGN KEY (original_job_id) REFERENCES jobs(id) ON DELETE SET NULL;
