-- ─────────────────────────────────────────────────────────────────────────────
-- Job geo-tracking screen RPCs. site_visit_events RLS lets the worker and the
-- client read, but NOT the business owner who assigned the worker. These
-- SECURITY DEFINER functions serve all three views from one authorized path:
--   • job's client or job's tradie (owner/assigner) → see ALL workers' events
--   • business owner of a worker on the job          → see their workers' events
--   • a plain worker on the job                       → see only their OWN events
-- Anyone else gets nothing.
-- ─────────────────────────────────────────────────────────────────────────────

-- True when the caller may see the WHOLE job's tracking (all workers).
create or replace function public.can_view_job_tracking(p_job_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.jobs j
      where j.id = p_job_id and (j.client_id = p_uid or j.tradie_id = p_uid)
    )
    or exists (
      select 1
      from public.site_visit_events e
      join public.business_team_members b
        on b.member_profile_id = e.tradie_id and b.business_owner_id = p_uid
      where e.job_id = p_job_id
    );
$$;

revoke all on function public.can_view_job_tracking(uuid, uuid) from public, anon;
grant execute on function public.can_view_job_tracking(uuid, uuid) to authenticated;

-- Job centre/title/address/radius for the map + header.
create or replace function public.get_job_tracking_meta(p_job_id uuid)
returns table (
  title text,
  address text,
  latitude numeric,
  longitude numeric,
  radius_m integer,
  client_id uuid,
  owner_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_privileged boolean;
  v_is_worker boolean;
begin
  if v_uid is null then return; end if;
  v_privileged := public.can_view_job_tracking(p_job_id, v_uid);
  v_is_worker := exists (
    select 1 from public.site_visit_events e
    where e.job_id = p_job_id and e.tradie_id = v_uid
  );
  if not v_privileged and not v_is_worker then return; end if;

  return query
  select j.title,
         j.location_address,
         j.latitude,
         j.longitude,
         coalesce(j.geofence_radius_m, 150),
         j.client_id,
         j.tradie_id
  from public.jobs j
  where j.id = p_job_id;
end;
$$;

revoke all on function public.get_job_tracking_meta(uuid) from public, anon;
grant execute on function public.get_job_tracking_meta(uuid) to authenticated;

-- ENTER/EXIT crossings for a job, scoped to what the caller may see.
create or replace function public.get_job_site_visits(p_job_id uuid)
returns table (
  tradie_id uuid,
  tradie_name text,
  action text,
  occurred_at timestamptz,
  latitude numeric,
  longitude numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_privileged boolean;
begin
  if v_uid is null then return; end if;
  v_privileged := public.can_view_job_tracking(p_job_id, v_uid);

  return query
  select e.tradie_id,
         coalesce(p.full_name, 'Worker') as tradie_name,
         e.action,
         e.occurred_at,
         e.latitude,
         e.longitude
  from public.site_visit_events e
  left join public.profiles p on p.id = e.tradie_id
  where e.job_id = p_job_id
    and e.action in ('ENTER', 'EXIT')
    -- Privileged callers see everyone; otherwise only the caller's own rows.
    and (v_privileged or e.tradie_id = v_uid)
  order by e.occurred_at asc;
end;
$$;

revoke all on function public.get_job_site_visits(uuid) from public, anon;
grant execute on function public.get_job_site_visits(uuid) to authenticated;
