-- Ensure tradies can delete (withdraw) their own quotes
-- This policy may already exist from the initial quotes migration,
-- but we re-create it to guarantee it's applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quotes'
    AND policyname = 'Tradies can delete own quotes'
  ) THEN
    CREATE POLICY "Tradies can delete own quotes"
      ON quotes FOR DELETE
      TO authenticated
      USING (auth.uid() = tradie_id);
  END IF;
END $$;
