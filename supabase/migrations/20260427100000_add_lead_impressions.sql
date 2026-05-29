/*
  Lead-impression tracking for the "still interested?" nudge cron.

  When a new lead is broadcast to matching tradies, we record an impression
  per tradie. The cron then walks these rows to send 24h push, 48h push+email,
  and at 72h auto-pass any tradie who hasn't quoted or manually passed.

  This same table also persists manual passes (Pass button on Dashboard /
  Work Hub). Persisting pass state — instead of the existing localStorage
  approach — means a tradie's pass survives device switches, and the cron
  can distinguish "they passed already, leave them alone" from "still ghosting".
*/

CREATE TABLE IF NOT EXISTS lead_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL DEFAULT now(),
  reminder_24h_sent_at timestamptz,
  reminder_48h_sent_at timestamptz,
  passed_at timestamptz,
  pass_reason text CHECK (pass_reason IN ('manual', 'auto_no_response')),
  UNIQUE(job_id, tradie_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_impressions_tradie ON lead_impressions(tradie_id);
CREATE INDEX IF NOT EXISTS idx_lead_impressions_job ON lead_impressions(job_id);
-- Used by the cron to find candidates needing reminders / auto-pass
CREATE INDEX IF NOT EXISTS idx_lead_impressions_shown_pending
  ON lead_impressions(shown_at)
  WHERE passed_at IS NULL;

ALTER TABLE lead_impressions ENABLE ROW LEVEL SECURITY;

-- Tradies can read and update (pass) their own impressions
CREATE POLICY "Tradies read own impressions"
  ON lead_impressions FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

CREATE POLICY "Tradies upsert own impressions"
  ON lead_impressions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

CREATE POLICY "Tradies update own impressions"
  ON lead_impressions FOR UPDATE
  TO authenticated
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);

-- Service role (cron) needs to read all + update reminder/auto-pass timestamps
CREATE POLICY "Service role manages all impressions"
  ON lead_impressions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
