-- Migration: revoke_public_pay_trigger_fns
-- Type: Security hardening (function grants)
-- Description: Supabase advisor 0028/0029 — enforce_external_pay_tier() and
-- flag_offplatform_payment() are still flagged as anon/authenticated-executable
-- SECURITY DEFINER functions. Both are pure trigger functions (RETURN trigger),
-- each attached to a live trigger, and are never meant to be called as RPCs.
--
-- Same root cause as 20260718120000: the companion 20260717090000 migration
-- revoked them FROM anon, authenticated, but the executable-by-anon privilege
-- actually comes from the implicit EXECUTE grant to PUBLIC that Postgres attaches
-- at function creation. Revoking only from anon/authenticated leaves PUBLIC=X in
-- the ACL, which anon/authenticated then inherit — so the advisor never cleared.
-- (Verified on live 2026-07-20: proacl = {=X/postgres,...} and
-- has_function_privilege('anon'/'authenticated', ...) still true.)
--
-- Revoking from PUBLIC clears the advisor. Trigger firing is unaffected — a trigger
-- runs with the privileges established at CREATE TRIGGER time, not the session
-- role's EXECUTE grant on the function.
--
-- Follow-up to: 20260717090000_revoke_anon_security_definer_fns.sql
--               20260718120000_revoke_anon_lock_billing_fns.sql

-- ============================================================
-- TRIGGER FUNCTIONS — payment tier / off-platform enforcement
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.enforce_external_pay_tier() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_offplatform_payment()  FROM PUBLIC, anon, authenticated;
