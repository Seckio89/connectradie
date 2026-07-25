-- Migration: drop_profiles_bank_columns
-- Type: Security — PII exposure (audit finding #4), follow-up to 20260725140000
-- Description: Removes the bank columns from `profiles` now that they live in
-- `profile_private` (owner/admin-only). `profiles` is readable by ANY signed-in
-- user (SELECT policy `auth.role() = 'authenticated'`), so leaving these here means
-- one signup could scrape every tradie's bank account number.
--
-- Deliberately a SEPARATE migration from the split: dropping these before
-- invoice-contact and the Settings UI were repointed would have made
-- invoice-contact's select fail with 42703 and broken bank-transfer invoices.
--
-- Verified before running:
--   • invoice-contact redeployed, now reading profile_private (service role).
--   • Bank round-trip proven: a test row inserted into profile_private was
--     returned by the exact query invoice-contact runs, then removed.
--   • RLS proven three ways: owner=1 row, non-admin stranger=0 rows, admin=1 row.
--   • typecheck + build clean, 582/582 tests pass.
--   • No data lost: 0 of 3 profiles ever had bank details populated, and anything
--     present was copied across by 20260725140000.

alter table public.profiles
  drop column if exists bank_name,
  drop column if exists bank_bsb,
  drop column if exists bank_account_number,
  drop column if exists bank_account_name;
