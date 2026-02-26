/*
  # Enforce verification at database level for job acceptance

  1. Problem
    - The verification check for tradies accepting jobs was UI-only
    - An unverified or license-expired tradie could bypass the frontend
      and accept jobs by calling the Supabase API directly

  2. Solution
    - Create a SECURITY DEFINER helper function `is_tradie_verified()`
      that checks the profile's verification_status and license_expiry
    - Replace the permissive UPDATE policy on jobs with a restrictive one
      that requires verified status when a tradie sets themselves as assignee

  3. Security Changes
    - The UPDATE policy now allows:
      a) Clients to update their own jobs (client_id = auth.uid())
      b) Already-assigned tradies to update their own jobs (tradie_id = auth.uid())
         only if they are verified (or their license hasn't expired)
      c) Admins via is_admin() function
    - A new RESTRICTIVE policy blocks any tradie from setting tradie_id to
      their own ID if they are not verified
*/

CREATE OR REPLACE FUNCTION is_tradie_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_expiry date;
BEGIN
  SELECT verification_status, license_expiry
  INTO v_status, v_expiry
  FROM profiles
  WHERE id = p_user_id;

  IF v_status IS NULL THEN
    RETURN false;
  END IF;

  IF v_status = 'expired' THEN
    RETURN false;
  END IF;

  IF v_expiry IS NOT NULL AND v_expiry < CURRENT_DATE THEN
    RETURN false;
  END IF;

  IF v_status = 'verified' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Both parties can update jobs" ON jobs;

CREATE POLICY "Clients can update own jobs"
  ON jobs FOR UPDATE TO authenticated
  USING (client_id = (SELECT auth.uid()))
  WITH CHECK (client_id = (SELECT auth.uid()));

CREATE POLICY "Verified tradies can update assigned jobs"
  ON jobs FOR UPDATE TO authenticated
  USING (tradie_id = (SELECT auth.uid()))
  WITH CHECK (
    tradie_id = (SELECT auth.uid())
    AND is_tradie_verified((SELECT auth.uid()))
  );

CREATE POLICY "Admins can update any jobs"
  ON jobs FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
