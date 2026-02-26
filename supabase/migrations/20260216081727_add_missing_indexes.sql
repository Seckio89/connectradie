/*
  # Add missing indexes for query performance

  1. Indexes added
    - `jobs.status` - frequently filtered
    - `jobs.client_id` - frequently joined/filtered
    - `jobs.tradie_id` - frequently joined/filtered
    - `notifications.user_id, read` - filtered by user + unread
    - `notifications.created_at` - sorted by recency
    - `messages.conversation_id, created_at` - message listing
    - `messages.sender_id` - message sender lookups
    - `payments.profile_id` - user payment history
    - `payments.job_id` - job payment lookups
    - `reviews.tradie_id` - tradie rating lookups
    - `job_milestones.job_id` - milestone listing per job
    - `invoices.created_by` - invoice listing per user
    - `service_reminders.client_id` - reminder listing per client
    - `service_reminders.tradie_id` - reminder listing per tradie

  2. Notes
    - All indexes use IF NOT EXISTS to avoid errors on re-run
    - Composite indexes match common query patterns
*/

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tradie_id ON jobs(tradie_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_payments_profile_id ON payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_job_id ON payments(job_id);

CREATE INDEX IF NOT EXISTS idx_reviews_tradie_id ON reviews(tradie_id);

CREATE INDEX IF NOT EXISTS idx_job_milestones_job_id ON job_milestones(job_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);

CREATE INDEX IF NOT EXISTS idx_service_reminders_client_id ON service_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_tradie_id ON service_reminders(tradie_id);
