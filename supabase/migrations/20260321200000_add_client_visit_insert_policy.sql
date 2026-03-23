-- Allow clients to insert visits on their own service agreements.
-- This lets clients log extra/ad-hoc visits that happen outside the regular schedule.

DROP POLICY IF EXISTS "Client can insert visits" ON public.service_visits;
CREATE POLICY "Client can insert visits" ON public.service_visits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.client_id = (SELECT auth.uid())
    )
  );

-- Allow clients to update visits they logged (e.g., add notes, mark status)
DROP POLICY IF EXISTS "Client can update own visits" ON public.service_visits;
CREATE POLICY "Client can update own visits" ON public.service_visits
  FOR UPDATE TO authenticated
  USING (
    completed_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.client_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    completed_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.client_id = (SELECT auth.uid())
    )
  );

-- Add archived_at column to jobs for tradie archiving (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;
