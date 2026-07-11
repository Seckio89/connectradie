-- ─────────────────────────────────────────────────────────────────────────────
-- Let a recurring service belong to an OFF-APP client_contact (mirrors what jobs
-- already does). Commercial recurring work quoted via the pricing helper is
-- usually for an off-app contact, which previously couldn't have a recurring_jobs
-- row — client_id was NOT NULL and expected an on-app profile.
--
-- The tradie manages these via the existing "Users can manage their own recurring
-- jobs" policy (auth.uid() = tradie_id), so no new RLS is needed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE recurring_jobs ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS client_contact_id uuid REFERENCES client_contacts(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_jobs_client_present') THEN
    ALTER TABLE recurring_jobs
      ADD CONSTRAINT recurring_jobs_client_present
      CHECK (client_id IS NOT NULL OR client_contact_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_jobs_client_contact ON recurring_jobs(client_contact_id);
