-- Migration: private_pii_split
-- Type: Security — PII exposure (audit finding #4)
-- Description: `profiles` and `tradie_details` are both readable by ANY signed-in
-- user (SELECT policies: profiles = `auth.role() = 'authenticated'`,
-- tradie_details = `USING (true)`). Between them they hold bank account numbers,
-- BSBs, ABNs, licence numbers, insurance policy numbers and certificates — so a
-- single signup could scrape the whole tradie base.
--
-- We deliberately do NOT restrict `profiles` itself: 53 PostgREST FK-embeds
-- (`profiles!..._fkey(...)`) and 76 direct reads depend on it being readable, and
-- a view swap would break every embed. Instead we RELOCATE the secrets, mirroring
-- the job_access_details pattern already used for access PINs. Public-facing
-- columns (business_name, trade_category, is_verified, bio, hourly_rate…) stay put,
-- so search, public profiles and quote comparison are untouched.
--
-- Verified before writing: bank columns hold NO data (0 of 3 profiles populated)
-- and the dropped tradie_details columns are empty AND unreferenced in production
-- code (their only mentions are a test fixture), so nothing is lost.

-- ── PHASE A: drop dead sensitive columns from tradie_details ────────────────
-- Each verified empty (0 rows populated) and unreferenced outside a test fixture.
-- DELIBERATELY KEPT: insurance_provider (read by public-quote + searchRanking as a
-- trust signal) and white_card (surfaced via the gated get_service_worker_details
-- RPC) — dropping those would have broken live features.
alter table public.tradie_details
  drop column if exists abn,
  drop column if exists license_number,
  drop column if exists policy_number,
  drop column if exists insurance_document_url,
  drop column if exists food_safety_cert,
  drop column if exists cookery_cert;

-- ── PHASE B: relocate bank details off `profiles` ───────────────────────────
create table if not exists public.profile_private (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  bank_name           text,
  bank_bsb            text,
  bank_account_number text,
  bank_account_name   text,
  updated_at          timestamptz not null default now()
);

-- Carry across anything already stored (currently none — verified 0 populated).
insert into public.profile_private (profile_id, bank_name, bank_bsb, bank_account_number, bank_account_name)
select id, bank_name, bank_bsb, bank_account_number, bank_account_name
from public.profiles
where coalesce(bank_name, bank_bsb, bank_account_number, bank_account_name) is not null
on conflict (profile_id) do nothing;

alter table public.profile_private enable row level security;

-- Owner-or-admin only. The service role bypasses RLS, which is how invoice-contact
-- reads these to print bank details on an external (bank-transfer) invoice.
drop policy if exists "Owner or admin can view private profile data" on public.profile_private;
create policy "Owner or admin can view private profile data"
  on public.profile_private for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Owner can insert own private profile data" on public.profile_private;
create policy "Owner can insert own private profile data"
  on public.profile_private for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists "Owner can update own private profile data" on public.profile_private;
create policy "Owner can update own private profile data"
  on public.profile_private for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

comment on table public.profile_private is
  'Owner/admin-only PII split out of public.profiles (which any signed-in user can '
  'read). Bank details for off-platform invoices live here. Service role (edge '
  'functions such as invoice-contact) bypasses RLS.';

-- NOTE: profiles.bank_* columns are intentionally NOT dropped in this migration.
-- They are removed in a FOLLOW-UP migration only after invoice-contact and the
-- Settings UI are repointed and the payment path is verified — dropping them here
-- would 42703 invoice-contact's select and break bank-transfer invoices.
