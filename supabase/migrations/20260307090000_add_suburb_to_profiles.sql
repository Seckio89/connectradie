-- Add suburb column to profiles for location display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suburb text;
