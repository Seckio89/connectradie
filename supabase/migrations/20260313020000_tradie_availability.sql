-- Tradie Availability — time-block-based availability with clash detection
-- Supports recurring job blocks, one-off jobs, personal time, and leave.

CREATE TABLE IF NOT EXISTS tradie_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_blocked BOOLEAN DEFAULT false,
  reason TEXT, -- 'recurring_job', 'one_off_job', 'personal', 'leave'
  source_job_id UUID, -- FK to jobs or recurring_sessions
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tradie_id, date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_tradie_availability_tradie_date ON tradie_availability (tradie_id, date);
CREATE INDEX IF NOT EXISTS idx_tradie_availability_source ON tradie_availability (source_job_id) WHERE source_job_id IS NOT NULL;

ALTER TABLE tradie_availability ENABLE ROW LEVEL SECURITY;

-- Tradie can manage their own rows
CREATE POLICY "Tradie can manage own availability"
  ON tradie_availability FOR ALL TO authenticated
  USING (tradie_id = (SELECT auth.uid()))
  WITH CHECK (tradie_id = (SELECT auth.uid()));

-- Anyone authenticated can read (homeowner needs to see for booking)
CREATE POLICY "Anyone can read availability"
  ON tradie_availability FOR SELECT TO authenticated
  USING (true);
