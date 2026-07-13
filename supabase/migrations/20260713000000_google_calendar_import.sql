-- Google Calendar → ConnecTradie import.
-- Imported events do NOT become `jobs` (jobs are client-owned pipeline records
-- with a lifecycle) — they land in a dedicated visits table, mapped to a team
-- member and carrying the source calendar's colour (colours = employees).

-- 1. Team members can carry the colour they had in Google Calendar.
alter table business_team_members
  add column if not exists color text;

-- 2. Imported calendar events.
create table if not exists imported_calendar_visits (
  id                 uuid primary key default gen_random_uuid(),
  business_owner_id  uuid not null references profiles(id) on delete cascade,
  team_member_id     uuid references business_team_members(id) on delete set null,
  google_calendar_id text not null,
  google_event_id    text not null,
  title              text not null default '',
  description        text,
  location           text,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  all_day            boolean not null default false,
  color              text,
  source_calendar    text,               -- calendar summary (e.g. "Sheril")
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Duplicate detection: the same Google event can only exist once per business.
-- Re-importing upserts on this key instead of creating duplicates.
create unique index if not exists idx_imported_visits_dedup
  on imported_calendar_visits (business_owner_id, google_event_id);

create index if not exists idx_imported_visits_owner_date
  on imported_calendar_visits (business_owner_id, starts_at);

create index if not exists idx_imported_visits_member
  on imported_calendar_visits (team_member_id);

alter table imported_calendar_visits enable row level security;

-- The business owner manages only their own imported visits.
drop policy if exists "owner manages imported visits" on imported_calendar_visits;
create policy "owner manages imported visits"
  on imported_calendar_visits for all
  to authenticated
  using (auth.uid() = business_owner_id)
  with check (auth.uid() = business_owner_id);
