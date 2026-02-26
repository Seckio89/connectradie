/*
  # Create app_settings table for global configuration

  1. New Tables
    - `app_settings`
      - `key` (text, primary key) - Setting identifier
      - `value` (jsonb) - Setting value in JSON format
      - `updated_by` (uuid, nullable) - Who last updated the setting
      - `updated_at` (timestamptz) - When setting was last updated

  2. Initial Data
    - `training_mode_enabled` set to false by default

  3. Security
    - Enable RLS on `app_settings` table
    - Authenticated users can read settings
    - Only the designated admin (Admin@tradie.com) can update settings
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can update app settings"
  ON app_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND lower(profiles.email) = 'admin@tradie.com'
    )
  );

INSERT INTO app_settings (key, value)
VALUES ('training_mode_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
