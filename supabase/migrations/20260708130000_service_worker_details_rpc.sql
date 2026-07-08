/*
  # Client-visible (GATED) details of the worker assigned to their service

  1. New function
    - `get_service_worker_details(p_recurring_job_id)` — SECURITY DEFINER.
      Returns the assigned worker's PUBLIC/professional details for the CLIENT
      of that ongoing service: name, trade, verification badges, certificates.
      Explicitly EXCLUDES personal contact (phone/email) — the contact-gating
      decision: clients talk to workers via in-app messaging or through the
      business, not by scraping a worker's mobile.

  2. Access rule (enforced inside)
    - Caller must be the client OR the owning tradie of the recurring job.
      (The owner already sees contact details elsewhere — Team page — so this
      function can stay uniformly gated.)

  3. Why SECURITY DEFINER
    - business_team_members / profiles rows are RLS-protected from clients; a
      direct join would silently return null. This mirrors get_team_site_activity.
*/

CREATE OR REPLACE FUNCTION get_service_worker_details(p_recurring_job_id uuid)
RETURNS TABLE (
  worker_name text,
  employment_type text,
  trade_specialty text,
  declared_trades text[],
  verified_trades text[],
  abn_verified boolean,
  license_verified boolean,
  identity_verified boolean,
  qualifications text[],
  white_card text,
  business_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.full_name, btm.invite_name),
    COALESCE(p.employment_type, btm.role),
    btm.trade_specialty,
    COALESCE(p.declared_trades, ARRAY[]::text[]),
    COALESCE(p.verified_trades, ARRAY[]::text[]),
    COALESCE(p.abn_verified, false),
    COALESCE(p.license_verified, false),
    COALESCE(p.is_identity_verified, false),
    COALESCE(td.qualifications, ARRAY[]::text[]),
    td.white_card,
    owner_td.business_name
  FROM recurring_jobs rj
  JOIN business_team_members btm ON btm.id = rj.assigned_team_member_id
  LEFT JOIN profiles p ON p.id = btm.member_profile_id
  LEFT JOIN tradie_details td ON td.profile_id = btm.member_profile_id
  LEFT JOIN tradie_details owner_td ON owner_td.profile_id = rj.tradie_id
  WHERE rj.id = p_recurring_job_id
    AND (rj.client_id = (select auth.uid()) OR rj.tradie_id = (select auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION get_service_worker_details(uuid) TO authenticated;
