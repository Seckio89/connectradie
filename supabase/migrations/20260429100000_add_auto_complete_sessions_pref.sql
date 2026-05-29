-- Tradie preference: should the auto-confirm-sessions cron silently flip
-- recurring_sessions to 'completed' once the end_time passes, or should the
-- session sit in 'awaiting_completion' until the tradie taps a button?
-- Default true preserves existing behaviour for every tradie already on the platform.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_complete_sessions BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN profiles.auto_complete_sessions IS
  'When true, recurring service sessions auto-complete after their end_time. When false, sessions wait for the tradie to manually confirm completion.';

-- Extend recurring_sessions.status to allow the new in-between value used by
-- the auto-confirm cron when a tradie has opted out of auto-completion.
ALTER TABLE recurring_sessions
  DROP CONSTRAINT IF EXISTS recurring_sessions_status_check;

ALTER TABLE recurring_sessions
  ADD CONSTRAINT recurring_sessions_status_check
  CHECK (status IN ('pending_confirmation', 'scheduled', 'awaiting_completion', 'completed', 'rescheduled', 'skipped', 'extra'));

-- Index so the cron query (status='scheduled' filter, then re-flag opted-out
-- tradies' rows) and the tradie's "needs my action" lookups stay quick.
CREATE INDEX IF NOT EXISTS idx_recurring_sessions_awaiting_completion
  ON recurring_sessions (recurring_job_id, scheduled_date)
  WHERE status = 'awaiting_completion';
