-- Add apprentice, supervisor, and license-required fields to profiles table.
-- license_number, license_state, and license_expiry already exist.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervisor_license text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS is_license_required boolean NOT NULL DEFAULT true;

-- Index for filtering apprentices linked to a supervisor license
CREATE INDEX IF NOT EXISTS idx_profiles_supervisor_license
  ON profiles (supervisor_license)
  WHERE supervisor_license IS NOT NULL;

COMMENT ON COLUMN profiles.is_license_required IS
  'Computed on save from state + trade. false for exempt trades (Handyman, Cleaning, etc.) so they are not blocked from going live.';
