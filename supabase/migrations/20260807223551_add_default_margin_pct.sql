-- ─────────────────────────────────────────────────────────────────────────────
-- tradie_cost_settings.default_margin_pct — the tradie's remembered margin %,
-- so the quote estimator prefills what they last used instead of a hardcoded 15.
--
-- Why THIS table and not tradie_details, where hourly_rate and
-- default_call_out_fee_cents live: tradie_details is SELECT-readable by every
-- authenticated user ("Authenticated users can view tradie details" — qual
-- `true`), because it backs the public tradie profile. A charge-out rate is
-- advertised on purpose; a margin percentage is not. Putting it there would
-- hand every client the tradie's markup.
--
-- tradie_cost_settings is owner-only on select/insert/update
-- (auth.uid() = tradie_id), which is the correct tier for it. The column is
-- charge-side rather than cost-side, so it is deliberately NOT part of the
-- CostBasis type the cost chain consumes — see src/lib/costModel.ts, which must
-- stay ignorant of what the tradie charges.
--
-- Defaults to 15 to match the estimator's previous hardcoded value, so existing
-- rows keep behaving exactly as they did. 0 is a legitimate saved value (a
-- tradie whose hourly rate already carries their profit), which is why this is
-- NOT NULL with a default rather than nullable-means-unset.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tradie_cost_settings
  add column if not exists default_margin_pct numeric not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tradie_cost_settings_default_margin_pct_range'
  ) then
    alter table public.tradie_cost_settings
      add constraint tradie_cost_settings_default_margin_pct_range
      check (default_margin_pct >= 0 and default_margin_pct <= 200);
  end if;
end $$;

comment on column public.tradie_cost_settings.default_margin_pct is
  'Charge-side margin % the estimator prefills. Lives here rather than on tradie_details because that table is readable by all authenticated users and a margin is not public. Bounded 0-200 to match the other percentage columns.';
