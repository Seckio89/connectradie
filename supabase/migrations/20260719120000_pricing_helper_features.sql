-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing Helper feature set:
--   1. custom_task_suggestions — tradies suggest missing task types from the
--      "Other" trade; submissions are deduped + counted; admins approve/reject.
--   2. quote_templates — tradies save a sent quote as a reusable template.
--   3. quotes.trade_category / property_type + get_area_price_range() — an
--      anonymised, aggregate-only market price range (never individual quotes).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Custom task suggestions ───────────────────────────────────────────────
create table if not exists public.custom_task_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  submitted_by         uuid references public.profiles(id) on delete set null,
  task_name            text not null,
  task_name_normalized text not null,
  trade_context        text,
  times_submitted      integer not null default 1,
  status               text not null default 'pending'
                         check (status in ('pending','approved','rejected')),
  approved_as_category text,
  reviewed_by          uuid references public.profiles(id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- One canonical row per (normalized name, trade context) so re-submissions
-- increment the counter instead of creating duplicates.
create unique index if not exists custom_task_suggestions_norm_uq
  on public.custom_task_suggestions (task_name_normalized, coalesce(trade_context, ''));
create index if not exists custom_task_suggestions_status_idx
  on public.custom_task_suggestions (status, times_submitted desc);

alter table public.custom_task_suggestions enable row level security;

-- Service role: everything.
drop policy if exists cts_service_all on public.custom_task_suggestions;
create policy cts_service_all on public.custom_task_suggestions
  for all to service_role using (true) with check (true);

-- Admins: read + moderate everything.
drop policy if exists cts_admin_read on public.custom_task_suggestions;
create policy cts_admin_read on public.custom_task_suggestions
  for select to authenticated using (public.is_admin());
drop policy if exists cts_admin_update on public.custom_task_suggestions;
create policy cts_admin_update on public.custom_task_suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Any signed-in tradie: read APPROVED suggestions (drives quick-add chips).
drop policy if exists cts_read_approved on public.custom_task_suggestions;
create policy cts_read_approved on public.custom_task_suggestions
  for select to authenticated using (status = 'approved');

-- Submit / increment a suggestion. SECURITY DEFINER so callers don't need an
-- INSERT policy; dedups on the normalized name within the trade context.
create or replace function public.submit_custom_task(p_task_name text, p_trade_context text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_task_name);
  v_norm text := lower(regexp_replace(btrim(p_task_name), '\s+', ' ', 'g'));
  v_ctx  text := nullif(btrim(coalesce(p_trade_context, '')), '');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_norm = '' or length(v_norm) < 2 then raise exception 'Task name too short'; end if;
  if length(v_name) > 120 then v_name := left(v_name, 120); v_norm := left(v_norm, 120); end if;

  insert into public.custom_task_suggestions (submitted_by, task_name, task_name_normalized, trade_context)
  values (v_uid, v_name, v_norm, v_ctx)
  on conflict (task_name_normalized, coalesce(trade_context, ''))
  do update set times_submitted = public.custom_task_suggestions.times_submitted + 1,
               updated_at = now();
end;
$$;

revoke all on function public.submit_custom_task(text, text) from public, anon;
grant execute on function public.submit_custom_task(text, text) to authenticated;

-- ── 2. Quote templates ───────────────────────────────────────────────────────
-- quote_templates already exists (on-app SubmitQuoteModal uses name/message/
-- default_duration/includes_materials). Enrich it so the off-app NewQuoteModal
-- can save a full quote (title, scope, pricing, property, conditions) as a
-- reusable template. Existing consumers ignore the new columns.
create table if not exists public.quote_templates (
  id                 uuid primary key default gen_random_uuid(),
  tradie_id          uuid not null references public.profiles(id) on delete cascade,
  name               text not null,
  message            text,
  default_duration   text,
  includes_materials boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.quote_templates add column if not exists title text;
alter table public.quote_templates add column if not exists scope text;
alter table public.quote_templates add column if not exists internal_notes text;
alter table public.quote_templates add column if not exists price numeric;
alter table public.quote_templates add column if not exists property_type text;
alter table public.quote_templates add column if not exists trade_category text;
alter table public.quote_templates add column if not exists conditions text;

create index if not exists quote_templates_tradie_idx
  on public.quote_templates (tradie_id, created_at desc);

alter table public.quote_templates enable row level security;

drop policy if exists qt_service_all on public.quote_templates;
create policy qt_service_all on public.quote_templates
  for all to service_role using (true) with check (true);

-- Tradie owns their own templates (full CRUD).
drop policy if exists qt_owner_all on public.quote_templates;
create policy qt_owner_all on public.quote_templates
  for all to authenticated using (auth.uid() = tradie_id) with check (auth.uid() = tradie_id);

-- ── 3. Area price comparison ─────────────────────────────────────────────────
-- Tag quotes with trade + property so aggregate ranges can be computed. Geo
-- comes from the joined job (jobs.latitude/longitude).
alter table public.quotes add column if not exists trade_category text;
alter table public.quotes add column if not exists property_type text;

-- Anonymised market range. Returns a range ONLY when at least 5 comparable
-- quotes exist (privacy floor) — never individual quotes or tradie identities.
-- Geo match = ~±0.25° bounding box (~25 km) around the client location.
create or replace function public.get_area_price_range(
  p_trade    text,
  p_property text default null,
  p_lat      numeric default null,
  p_lng      numeric default null
)
returns table (sample_size integer, price_low numeric, price_high numeric, price_mid numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min_samples constant integer := 5;
  v_box constant numeric := 0.25;
begin
  return query
  with comparable as (
    select coalesce(q.firm_price, q.price_min) as price
    from public.quotes q
    join public.jobs j on j.id = q.job_id
    where q.status in ('accepted','completed')
      and coalesce(q.firm_price, q.price_min) > 0
      and lower(q.trade_category) = lower(p_trade)
      and (p_property is null or q.property_type is null or lower(q.property_type) = lower(p_property))
      and (
        p_lat is null or p_lng is null
        or (j.latitude is not null and j.longitude is not null
            and j.latitude between p_lat - v_box and p_lat + v_box
            and j.longitude between p_lng - v_box and p_lng + v_box)
      )
  ), agg as (
    select count(*)::int as n,
           percentile_cont(0.2) within group (order by price) as p20,
           percentile_cont(0.5) within group (order by price) as p50,
           percentile_cont(0.8) within group (order by price) as p80
    from comparable
  )
  select
    n,
    case when n >= v_min_samples then round(p20::numeric) end,
    case when n >= v_min_samples then round(p80::numeric) end,
    case when n >= v_min_samples then round(p50::numeric) end
  from agg;
end;
$$;

revoke all on function public.get_area_price_range(text, text, numeric, numeric) from public, anon;
grant execute on function public.get_area_price_range(text, text, numeric, numeric) to authenticated;
