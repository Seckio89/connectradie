/*
  # Add unique constraint on business_team_members

  1. Changes
    - Add unique constraint on (business_owner_id, member_profile_id)
      to prevent duplicate team member entries when linking via onboarding

  2. Notes
    - This enables upsert operations during the onboarding flow
    - Only applies when member_profile_id is not null
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_business_team_owner_member'
  ) THEN
    ALTER TABLE business_team_members
      ADD CONSTRAINT uq_business_team_owner_member
      UNIQUE (business_owner_id, member_profile_id);
  END IF;
END $$;
