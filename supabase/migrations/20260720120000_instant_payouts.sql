-- ─────────────────────────────────────────────────────────────────────────────
-- Instant payouts (opt-in): tier-configurable fee + per-tradie speed preference.
-- Standard (free) is ALWAYS the default; instant is opt-in per the pricing spec.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pricing_tiers
  add column if not exists instant_payout_bps integer not null default 150,
  add column if not exists instant_payout_min_cents integer not null default 200;

alter table public.tradie_details
  add column if not exists payout_speed_preference text not null default 'standard';

alter table public.tradie_details
  drop constraint if exists tradie_details_payout_speed_pref_check;
alter table public.tradie_details
  add constraint tradie_details_payout_speed_pref_check
  check (payout_speed_preference in ('standard', 'instant', 'ask'));
