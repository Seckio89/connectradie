-- Fix the join-a-business flow (Onboarding step 5 "Send Request").
--
-- 1) The requester inserts their own row into business_team_members, but the
--    only INSERT policy required business_owner_id = auth.uid() — so every
--    join request failed with "new row violates row-level security policy".
--    Allow authenticated users to insert a row for THEMSELVES (their own
--    member_profile_id); the owner-insert policy remains for direct invites.
CREATE POLICY "Members can request to join a team"
  ON business_team_members FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = member_profile_id);

-- 2) Make approval self-healing. employer_approve_member only flipped
--    profiles.employer_status, which left two holes seen in production:
--    • the member's role could still be 'client' (they end up on the wrong
--      dashboard with no way to switch) — an approved team member is a
--      tradie-side user, so set role='tradie' on approval;
--    • if the join-request's team row was never created (all of them, given
--      the RLS bug above), approval produced a team member invisible to
--      anything reading business_team_members (e.g. Assign Worker). Upsert
--      the row on approval so the roster is always consistent.
CREATE OR REPLACE FUNCTION public.employer_approve_member(member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET employer_status = 'active',
      role = 'tradie'
  WHERE id = member_id
    AND employer_id = auth.uid()
    AND employer_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or member not found';
  END IF;

  INSERT INTO business_team_members
    (business_owner_id, member_profile_id, invite_name, invite_email, trade_specialty, role, status, joined_at)
  SELECT
    auth.uid(),
    p.id,
    COALESCE(p.full_name, ''),
    p.email,
    COALESCE(td.trade_category, ''),
    CASE WHEN p.employment_type IN ('employee','subcontractor') THEN p.employment_type ELSE 'employee' END,
    'active',
    now()
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = member_id
  ON CONFLICT (business_owner_id, member_profile_id)
  DO UPDATE SET status = 'active', joined_at = COALESCE(business_team_members.joined_at, now());
END;
$$;
