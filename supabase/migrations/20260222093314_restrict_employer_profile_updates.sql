/*
  # Restrict Employer Profile Updates

  1. Security Changes
    - Drop the overly broad employer update policies from the previous migration
    - Create a SECURITY DEFINER function that employers call to approve/decline/remove
    - This function only allows changes to employer_id, employer_status, and employment_type
    - Employers cannot modify any other profile fields (name, email, password, etc.)

  2. New RPC Functions
    - `employer_approve_member(member_id uuid)` - Sets employer_status to 'active'
    - `employer_decline_member(member_id uuid)` - Clears employer_id, sets status to 'none'
    - `employer_remove_member(member_id uuid)` - Same as decline, for active members

  3. Notes
    - All functions verify that the caller is the actual employer_id on the target profile
    - Functions are SECURITY DEFINER so they bypass RLS but enforce their own checks
*/

DROP POLICY IF EXISTS "Employers can update employer_status on linked profiles" ON profiles;

CREATE OR REPLACE FUNCTION employer_approve_member(member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET employer_status = 'active'
  WHERE id = member_id
    AND employer_id = auth.uid()
    AND employer_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or member not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION employer_decline_member(member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET employer_id = NULL,
      employer_status = 'none',
      employment_type = 'none'
  WHERE id = member_id
    AND employer_id = auth.uid()
    AND employer_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or member not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION employer_remove_member(member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET employer_id = NULL,
      employer_status = 'none',
      employment_type = 'none'
  WHERE id = member_id
    AND employer_id = auth.uid()
    AND employer_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or member not found';
  END IF;
END;
$$;
