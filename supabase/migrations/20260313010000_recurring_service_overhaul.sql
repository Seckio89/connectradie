-- Recurring Service Overhaul
-- Adds recurring_sessions table and new columns to recurring_jobs
-- for standing arrangement + session generation support.

-- 1. Add new columns to recurring_jobs
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS agreed_price DECIMAL(10,2);
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS preferred_time TIME;
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('fortnightly', 'monthly'));
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS last_invoiced_at TIMESTAMPTZ;

-- 2. Create recurring_sessions table
CREATE TABLE IF NOT EXISTS recurring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_job_id UUID NOT NULL REFERENCES recurring_jobs(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  actual_date DATE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'rescheduled', 'skipped', 'extra')),
  extra_hours DECIMAL(4,2),
  extra_cost DECIMAL(10,2),
  reschedule_reason TEXT,
  reschedule_by TEXT CHECK (reschedule_by IN ('client', 'tradie')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_sessions_job_id ON recurring_sessions (recurring_job_id);
CREATE INDEX IF NOT EXISTS idx_recurring_sessions_date ON recurring_sessions (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_recurring_sessions_status ON recurring_sessions (status) WHERE status = 'scheduled';

-- 3. Enable RLS
ALTER TABLE recurring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowner can manage their own sessions"
  ON recurring_sessions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND rj.client_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND rj.client_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Tradie can manage sessions for their recurring jobs"
  ON recurring_sessions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND rj.tradie_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND rj.tradie_id = (SELECT auth.uid())
    )
  );

-- 4. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_recurring_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_recurring_sessions_updated_at
  BEFORE UPDATE ON recurring_sessions
  FOR EACH ROW EXECUTE FUNCTION update_recurring_sessions_updated_at();
