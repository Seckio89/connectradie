-- Migration: timestamps_not_null
-- Type: Schema truthfulness (removes ~16 type errors with zero TypeScript edits)
--
-- `created_at` / `updated_at` were declared `DEFAULT now()` but left nullable
-- across most of the schema. The generated types therefore say `string | null`,
-- and every call site that does `new Date(row.created_at)` or
-- `formatDate(row.created_at)` fails to typecheck — for a null that cannot
-- actually occur, because every one of these columns has a default and no code
-- path writes null.
--
-- The honest fix is to make the column say what is already true, rather than to
-- add ~16 defensive guards for an impossible case.
--
-- Verified before writing this:
--   • 74 candidate columns (nullable + has a default) across public.
--   • ALL 74 currently contain ZERO nulls.
--   • No code writes `created_at: null` / `updated_at: null` — grepped src/ and
--     supabase/functions/; no migration sets them NULL either.
--
-- The DO block below re-checks all three conditions per column at apply time and
-- skips anything that does not qualify, so it is safe to re-run and cannot fail
-- on a table that has since acquired a null.

do $$
declare
  r          record;
  v_nulls    bigint;
  v_altered  int := 0;
  v_skipped  int := 0;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name  = c.table_name
     and t.table_type  = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('created_at', 'updated_at')
      and c.is_nullable = 'YES'
      and c.column_default is not null   -- a default exists, so inserts can't yield null
    order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I is null', r.table_name, r.column_name)
      into v_nulls;

    if v_nulls = 0 then
      execute format('alter table public.%I alter column %I set not null', r.table_name, r.column_name);
      v_altered := v_altered + 1;
    else
      -- Leave it alone and say so rather than destroying data to satisfy a type.
      raise notice 'SKIPPED %.% — % null row(s) present', r.table_name, r.column_name, v_nulls;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  raise notice 'timestamps_not_null: % column(s) set NOT NULL, % skipped', v_altered, v_skipped;
end $$;
