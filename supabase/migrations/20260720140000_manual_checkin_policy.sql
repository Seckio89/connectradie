-- Manual check-in/out fallback (GPS unreliable indoors): let a worker insert
-- their OWN ENTER/EXIT crossings — but only for jobs they're actually on
-- (their job, or one owned by a business they belong to). Background geofence
-- crossings keep coming through the service-role edge function unchanged.
drop policy if exists "Tradies log own job-start location" on public.site_visit_events;
create policy "Tradies log own site events" on public.site_visit_events
  for insert to authenticated
  with check (
    tradie_id = (select auth.uid())
    and (
      action in ('START_ONSITE', 'START_OFFSITE')
      or (
        action in ('ENTER', 'EXIT')
        and exists (
          select 1 from public.jobs j
          where j.id = job_id
            and (
              j.tradie_id = (select auth.uid())
              or exists (
                select 1 from public.business_team_members b
                where b.business_owner_id = j.tradie_id
                  and b.member_profile_id = (select auth.uid())
              )
            )
        )
      )
    )
  );
