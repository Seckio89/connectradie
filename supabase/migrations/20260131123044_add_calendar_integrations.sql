-- Add Calendar Integration System
--
-- 1. New Tables
--    - calendar_integrations: Stores OAuth tokens and sync settings for calendar providers
--
-- 2. Security
--    - Enable RLS on calendar_integrations table
--    - Add policies for tradies to manage their own integrations
--
-- 3. Notes
--    - Supports multiple providers (Google, Outlook, etc.)
--    - Tokens are stored securely
--    - One active integration per tradie per provider

-- Create calendar integrations table
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz NOT NULL,
  calendar_id text,
  last_synced_at timestamptz,
  sync_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tradie_id, provider)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_tradie 
  ON calendar_integrations(tradie_id);

-- Enable RLS
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

-- Allow tradies to view their own calendar integrations
CREATE POLICY "Tradies can view own calendar integrations"
  ON calendar_integrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

-- Allow tradies to insert their own calendar integrations
CREATE POLICY "Tradies can insert own calendar integrations"
  ON calendar_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

-- Allow tradies to update their own calendar integrations
CREATE POLICY "Tradies can update own calendar integrations"
  ON calendar_integrations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);

-- Allow tradies to delete their own calendar integrations
CREATE POLICY "Tradies can delete own calendar integrations"
  ON calendar_integrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = tradie_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_calendar_integrations_updated_at
  BEFORE UPDATE ON calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_integrations_updated_at();