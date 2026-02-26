/*
  # Allow 'none' as valid employer_status

  1. Changes
    - Update the CHECK constraint on profiles.employer_status to include 'none'
    - This is needed because declining/removing sets status to 'none' (default state)
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_employer_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_employer_status_check
  CHECK (employer_status IN ('active', 'pending_approval', 'rejected', 'none'));
