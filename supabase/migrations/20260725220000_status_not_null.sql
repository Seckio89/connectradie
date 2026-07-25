-- Migration: status_not_null
-- Type: Schema truthfulness — follow-up to 20260725210000_timestamps_not_null
--
-- Same reasoning as the timestamps: `status` on these three tables carries a
-- DEFAULT and is guarded by a CHECK constraint, but was left nullable. The
-- generated types therefore say `string | null`, which forced `?? 'pending'`
-- fallbacks at ~13 render sites for a null that cannot occur.
--
-- `quotes.status` and `payments.status` are already NOT NULL — these three were
-- simply missed.
--
-- Verified before applying:
--   • jobs.status              default 'pending'  — 0 nulls
--   • abuse_reports.status     default 'pending'  — 0 nulls
--   • service_agreements.status default 'active'  — 0 nulls
--   • nothing in src/ or supabase/functions/ writes `status: null`, and no
--     migration sets it NULL.
--
-- Guarded per column so this cannot fail on a table that has since acquired a
-- null; it skips with a notice instead.

do $$
declare
  r        record;
  v_nulls  bigint;
begin
  for r in
    select unnest(array['jobs','abuse_reports','service_agreements']) as table_name
  loop
    execute format('select count(*) from public.%I where status is null', r.table_name) into v_nulls;

    if v_nulls = 0 then
      execute format('alter table public.%I alter column status set not null', r.table_name);
      raise notice 'SET NOT NULL: %.status', r.table_name;
    else
      raise notice 'SKIPPED %.status — % null row(s) present', r.table_name, v_nulls;
    end if;
  end loop;
end $$;
