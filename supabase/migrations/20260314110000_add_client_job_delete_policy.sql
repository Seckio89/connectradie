-- Allow clients to hard-delete their own jobs (only pending, not yet accepted)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'jobs'
    AND policyname = 'Clients can delete their own pending jobs'
  ) THEN
    CREATE POLICY "Clients can delete their own pending jobs"
      ON jobs FOR DELETE
      TO authenticated
      USING (
        client_id = auth.uid()
        AND status IN ('pending', 'cancelled', 'declined')
      );
  END IF;
END $$;

-- Allow cascade cleanup: clients can delete quotes on their own jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quotes'
    AND policyname = 'Clients can delete quotes on their own jobs'
  ) THEN
    CREATE POLICY "Clients can delete quotes on their own jobs"
      ON quotes FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM jobs
          WHERE jobs.id = quotes.job_id
          AND jobs.client_id = auth.uid()
        )
      );
  END IF;
END $$;
