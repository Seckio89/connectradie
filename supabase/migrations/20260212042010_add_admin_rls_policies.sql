/*
  # Add Admin RLS Policies for Profile Management

  1. Changes
    - Add RLS policy allowing admin users to view all profiles
    - Add RLS policy allowing admin users to update all profiles
    - This enables admins to approve/reject verification requests

  2. Security
    - Policies check that the user has role = 'admin'
    - Only users with admin role can modify verification status
    - Regular users can still only modify their own profiles

  3. Notes
    - Admins need these policies to manage verification requests
    - Does not affect existing user and tradie policies
*/

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );