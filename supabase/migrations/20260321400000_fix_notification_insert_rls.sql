-- Fix notification INSERT policy to allow authenticated users to create
-- notifications for other users (e.g., tradie notifying client about a quote).
-- The previous policy was too restrictive — it required the inserter to be
-- either the job's client or to already have a quote on the job.
-- This failed when:
--   1. A tradie's quote was just inserted and RLS couldn't yet see it
--   2. Notifications without a job_id (system notifications)

DROP POLICY IF EXISTS "Allow notification inserts for job participants" ON public.notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);
