-- Migration: Create client_errors table for ErrorBoundary reporting
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS client_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow anonymous inserts (errors can happen before auth)
ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert client errors"
  ON client_errors FOR INSERT
  WITH CHECK (true);

-- Only admins can read errors
CREATE POLICY "Admins can read client errors"
  ON client_errors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Auto-cleanup: delete errors older than 30 days
-- Run this as a cron job or pg_cron extension
-- SELECT cron.schedule('cleanup-client-errors', '0 3 * * *', $$DELETE FROM client_errors WHERE created_at < now() - interval '30 days'$$);
