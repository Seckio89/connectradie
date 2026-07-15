-- Removing a CRM contact fails when they have off-app jobs: the FK sets
-- jobs.client_contact_id NULL, which violates jobs_client_or_contact_check
-- (a job must have SOME client). The client list therefore cleans up a
-- contact's DEAD off-app jobs (never-accepted/declined/cancelled quotes)
-- before deleting the contact.
--
-- But the jobs DELETE policy only allowed a tradie to delete 'declined' jobs —
-- a pending off-app quote-job has NO client_id, so nobody could ever delete it.
-- Widen the tradie arm: their own OFF-APP jobs (client_id IS NULL) may also be
-- deleted while pending/cancelled/expired. On-app (client-owned) jobs are
-- unchanged, and active/completed work is never deletable.

DROP POLICY IF EXISTS "Users can delete own jobs" ON public.jobs;

CREATE POLICY "Users can delete own jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    ((SELECT auth.uid()) = client_id AND status = ANY (ARRAY['pending','cancelled','declined']))
    OR (
      (SELECT auth.uid()) = tradie_id
      AND (
        status = 'declined'
        -- off-app CRM jobs: the tradie owns the record end-to-end
        OR (client_id IS NULL AND status = ANY (ARRAY['pending','cancelled','expired']))
      )
    )
  );
