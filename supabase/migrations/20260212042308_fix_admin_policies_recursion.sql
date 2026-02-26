/*
  # Fix Admin RLS Policies - Remove Recursion

  1. Changes
    - Drop the recursive admin policies
    - Create a security definer function to check admin role without RLS
    - Create new admin policies using the helper function

  2. Security
    - Function bypasses RLS to check user's role
    - Policies properly allow admin access without recursion
    - Only users with admin role can modify verification status

  3. Notes
    - Fixes infinite recursion error
    - Security definer functions are safe when used correctly
*/

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Create a security definer function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin());

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());