-- Let an assigned worker SEE the ongoing service they're assigned to, and its
-- visits. Previously recurring_jobs / recurring_sessions were readable only by
-- the client or the owning tradie, so an assigned team member (a different
-- tradie account) got the assignment notification but the service never
-- appeared in their Work Hub. Read-only — owner actions stay owner-only.
CREATE POLICY "Assigned worker can view service"
  ON recurring_jobs FOR SELECT TO authenticated
  USING (
    assigned_team_member_id IN (
      SELECT id FROM business_team_members WHERE member_profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Assigned worker can view service sessions"
  ON recurring_sessions FOR SELECT TO authenticated
  USING (
    recurring_job_id IN (
      SELECT rj.id FROM recurring_jobs rj
      JOIN business_team_members btm ON btm.id = rj.assigned_team_member_id
      WHERE btm.member_profile_id = (SELECT auth.uid())
    )
  );
