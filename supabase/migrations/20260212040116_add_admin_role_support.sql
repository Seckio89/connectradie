/*
  # Add Admin Role Support

  1. Changes
    - Update the role check constraint to allow 'admin' role
    - This enables platform administrators to access admin-only features
  
  2. Details
    - Drops the existing constraint
    - Creates a new constraint that allows 'client', 'tradie', and 'admin'
  
  3. Notes
    - Existing profiles remain unchanged
    - Admin role can be assigned to users who need to review verifications
*/

-- Drop the existing role check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

-- Add updated constraint allowing admin role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('client', 'tradie', 'admin'));