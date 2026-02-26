/*
  # Add Connections Table for Pay-to-Connect System

  1. New Tables
    - `connections`
      - `id` (uuid, primary key)
      - `tradie_id` (uuid, references profiles) - The tradie who unlocked
      - `client_id` (uuid, references profiles) - The client being unlocked
      - `unlocked_at` (timestamptz) - When the connection was unlocked
      - `amount_paid` (numeric) - Amount paid for unlock
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `connections` table
    - Add policy for tradies to view their own connections
    - Add policy for tradies to create connections
*/

CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  amount_paid numeric(10,2) DEFAULT 15.00,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tradie_id, client_id)
);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tradies can view own connections"
  ON connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

CREATE POLICY "Tradies can create connections"
  ON connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

CREATE INDEX IF NOT EXISTS idx_connections_tradie_id ON connections(tradie_id);
CREATE INDEX IF NOT EXISTS idx_connections_client_id ON connections(client_id);