-- ─────────────────────────────────────────────────────────────────────────────
-- client_sites — multiple locations per CRM client (home / office / rental…).
-- Each site carries its own address, optional site-specific contact email/phone
-- (falling back to the client's main details), access instructions and notes.
--
-- Privacy: rows are readable ONLY by the tradie who owns the parent contact
-- (RLS below). A site's access_instructions are the tradie's own private CRM
-- notes; when a quote is created for the site they are copied onto the job's
-- access_instructions, where the existing relocation trigger moves them into
-- the service-role-only job_access_details table (PIN-gated at job level).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.client_sites (
  id                  uuid primary key default gen_random_uuid(),
  client_contact_id   uuid not null references public.client_contacts(id) on delete cascade,
  site_name           text not null,
  address             text,
  latitude            numeric,
  longitude           numeric,
  contact_email       text,
  contact_phone       text,
  access_instructions text,
  notes               text,
  is_default          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists client_sites_contact_idx
  on public.client_sites (client_contact_id, created_at);

-- At most one default site per client.
create unique index if not exists client_sites_one_default_uq
  on public.client_sites (client_contact_id) where is_default;

alter table public.client_sites enable row level security;

drop policy if exists cs_service_all on public.client_sites;
create policy cs_service_all on public.client_sites
  for all to service_role using (true) with check (true);

-- The tradie who owns the parent contact has full CRUD on its sites.
drop policy if exists cs_owner_all on public.client_sites;
create policy cs_owner_all on public.client_sites
  for all to authenticated
  using (exists (
    select 1 from public.client_contacts cc
    where cc.id = client_contact_id and cc.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.client_contacts cc
    where cc.id = client_contact_id and cc.owner_id = (select auth.uid())
  ));

-- Backfill: each contact's current address becomes its default "Main" site.
insert into public.client_sites
  (client_contact_id, site_name, address, latitude, longitude, is_default)
select cc.id, 'Main', cc.address, cc.latitude, cc.longitude, true
from public.client_contacts cc
where cc.address is not null
  and not exists (select 1 from public.client_sites s where s.client_contact_id = cc.id);
