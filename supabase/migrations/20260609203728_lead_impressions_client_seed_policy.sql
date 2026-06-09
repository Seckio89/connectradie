-- Allow clients to seed lead_impressions for their own jobs.
--
-- The notification fan-out (src/lib/notifications.ts notifyTradiesForNewLead
-- and notifyTradiesForUrgentJob) writes one impression per matched tradie
-- at job-post time, so the lead-reminder cron has rows to walk. Until now
-- the only INSERT policy required auth.uid() = tradie_id, so every client-
-- triggered upsert returned 403 from PostgREST and the reminder/auto-pass
-- pipeline silently received no seed rows.
--
-- This policy adds a second INSERT path: the caller can seed an impression
-- as long as they own the job it points at. tradie_id can still be anyone,
-- because the whole point is for the job's client to record which tradies
-- saw the lead. Clients cannot insert impressions for OTHER clients' jobs
-- (the EXISTS guard ties job_id back to auth.uid() via jobs.client_id).
--
-- The existing tradie-self-insert policy is left in place so a tradie can
-- still record a Pass action from their own session.

CREATE POLICY "Clients seed impressions for their own jobs"
  ON lead_impressions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jobs
      WHERE jobs.id = lead_impressions.job_id
        AND jobs.client_id = auth.uid()
    )
  );
