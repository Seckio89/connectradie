/*
  # Fix Profile Creation Trigger

  1. Changes
    - Drop the restrictive INSERT policy on profiles table
    - The trigger function already has SECURITY DEFINER which bypasses RLS
    - Add ON CONFLICT clause to handle duplicate inserts gracefully
    
  2. Security
    - Only the trigger can create profiles (via SECURITY DEFINER)
    - Users can still update and view their own profiles
*/

-- Drop the existing INSERT policy that blocks the trigger
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Recreate the trigger function with better conflict handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
