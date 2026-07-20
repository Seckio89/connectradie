-- Migration: revoke_anon_lock_billing_fns
-- Type: Security hardening (function grants)
-- Description: Supabase advisor 0028/0029 — lock_profile_billing_columns() and
-- lock_tradie_billing_columns() were created by the 12b8148 revenue-fix commit
-- (2026-07-18) after the blanket revoke in 20260717090000. Both are BEFORE UPDATE
-- trigger functions (RETURN trigger); PostgREST cannot invoke them meaningfully,
-- but they appear in the advisor because anon/authenticated can still reach
-- /rest/v1/rpc/<fn>.
--
-- IMPORTANT: the executable-by-anon privilege comes from the implicit EXECUTE
-- grant to PUBLIC that Postgres attaches to every newly-created function — NOT
-- from a direct grant to anon/authenticated. Revoking only FROM anon, authenticated
-- therefore does NOT clear the advisor: anon still inherits EXECUTE via PUBLIC.
-- (Verified against live 2026-07-20: proacl = {=X/postgres,...} i.e. PUBLIC=X, and
-- has_function_privilege('anon', ...) still returned true after the anon/auth revoke.)
-- We must revoke from PUBLIC as well. Trigger firing is unaffected — a trigger runs
-- with the privileges established at CREATE TRIGGER time, not the session role's
-- EXECUTE grant on the function.
--
-- Companion to: 20260717090000_revoke_anon_security_definer_fns.sql

-- ============================================================
-- TRIGGER FUNCTIONS — billing column enforcement
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.lock_profile_billing_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_tradie_billing_columns()  FROM PUBLIC, anon, authenticated;
