-- ─────────────────────────────────────────────────────────────────────────────
-- tradie_cost_settings.default_materials_markup_pct — the remembered materials
-- markup, so the estimator prefills what the tradie last used instead of a
-- hardcoded 20.
--
-- Sits beside default_margin_pct, and for the same reason: a markup is
-- commercially sensitive, and this table is owner-only on select/insert/update
-- (auth.uid() = tradie_id). tradie_details, where hourly_rate lives, is
-- SELECT-readable by every authenticated user because it backs the public tradie
-- profile — storing a markup there would publish it to clients.
--
-- Charge-side, so like default_margin_pct it is deliberately NOT part of the
-- CostBasis type the cost chain consumes. See src/lib/costModel.ts.
--
-- Defaults to 20 to match the estimator's previous hardcoded value, so existing
-- rows keep behaving exactly as they did. 0 is a legitimate saved value (a tradie
-- who passes materials through at cost), which is why this is NOT NULL with a
-- default rather than nullable-means-unset.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tradie_cost_settings
  add column if not exists default_materials_markup_pct numeric not null default 20;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tradie_cost_settings_default_materials_markup_pct_range'
  ) then
    alter table public.tradie_cost_settings
      add constraint tradie_cost_settings_default_materials_markup_pct_range
      check (default_materials_markup_pct >= 0 and default_materials_markup_pct <= 200);
  end if;
end $$;

comment on column public.tradie_cost_settings.default_materials_markup_pct is
  'Charge-side materials markup % the estimator prefills. Sits beside default_margin_pct for the same reason: a markup is commercially sensitive and this table is owner-only, unlike tradie_details. Bounded 0-200 to match the other percentage columns.';
