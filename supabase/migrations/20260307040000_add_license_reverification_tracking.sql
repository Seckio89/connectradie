ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_license_check timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS license_check_count integer DEFAULT 0;
