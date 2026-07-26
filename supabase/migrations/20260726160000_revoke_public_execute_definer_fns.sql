-- Migration: revoke_public_execute_definer_fns
-- Type: Security hardening (function grants)
-- Description:
--   Supersedes 20260717090000_revoke_anon_security_definer_fns.sql, which has
--   never actually done anything.
--
--   That migration wrote `REVOKE EXECUTE ON FUNCTION ... FROM anon`. But `anon`
--   never held a direct grant: CREATE FUNCTION grants EXECUTE to **PUBLIC**, and
--   anon inherits from PUBLIC. Revoking from anon alone removes nothing.
--
--   Verified against production via pg_proc.proacl — the leading `=X/postgres`
--   is the PUBLIC grant (empty grantee):
--
--     get_daily_profile_view_count:
--       =X/postgres | postgres=X | authenticated=X | service_role=X
--
--   and has_function_privilege('anon', …, 'EXECUTE') returned true for all five.
--   (The two trigger functions in that migration DO show no `=X/` entry, which
--   is exactly what made the failure easy to miss.)
--
--   Demonstrated end to end before applying this: as role `anon`,
--     SELECT * FROM search_businesses_by_name('%%')
--   returned a live row — business name plus the owner's real full name.
--
--   ── Correction to 20260717090000's stated reasoning ────────────────────────
--   That file says search_businesses_by_name is "deliberately NOT revoked —
--   powers public SEO/browse pages (anon search)". That is not true. Its only
--   caller in the repo is src/pages/Onboarding.tsx:56, and /onboarding is
--   wrapped in <ProtectedRoute requireOnboarding={false}> (src/App.tsx:232-235).
--   There is no anon caller, so revoking costs nothing — and it is the one of
--   the five with real exploitability: it returns profiles.full_name, has no
--   internal auth check, and its ILIKE '%' || search_term || '%' leaves the
--   wildcards unescaped, so prefix iteration enumerates the whole tradie base
--   unauthenticated. Migrations are never edited, so that comment stays and
--   this header supersedes it.
--
--   Safe because every consumer was traced. get_daily_profile_view_count and
--   has_user_engagement are reached only via src/lib/contactGating.ts:44,52 from
--   Search.tsx:170-171, which is guarded by `if (user)` (:160) and
--   `if (!user || !isClient) return` (:168) — /search IS a public route, but
--   anon never reaches those calls, and both helpers swallow errors into safe
--   defaults (return 0 / return false) so an unforeseen call degrades rather
--   than throws. get_service_worker_details and get_team_site_activity already
--   return zero rows to anon via their own auth.uid() checks.

-- ── Revoke the inherited PUBLIC grant ────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_daily_profile_view_count(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_service_worker_details(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_site_activity(timestamptz)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_user_engagement(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_businesses_by_name(text)           FROM PUBLIC, anon;

-- RETURNS trigger, so PostgREST cannot invoke it — tidiness, not exposure. It
-- picked up the PUBLIC grant because functions created through the Supabase MCP
-- apply_migration tool inherit the supabase_admin default ACL, which still
-- includes anon. (The postgres-owned default ACL for schema public is already
-- postgres | authenticated | service_role, so the ALTER DEFAULT PRIVILEGES in
-- 20260717090000 line 40 DID work — the residual gap is the MCP path, which is
-- why every new function should revoke explicitly, as
-- filter_tradies_by_service_area does.)
-- Revoked from authenticated too: nothing should ever call a trigger function
-- as an RPC. Verified live that this does NOT break trg_sync_has_push_subscription
-- — trigger firing is checked at trigger-creation time against the table owner,
-- not against the invoking user's EXECUTE privilege. An authenticated upsert into
-- profile_private still flipped profiles.has_push_subscription to true, while a
-- direct call errors with 0A000. Clears advisor 0029 for this function.
REVOKE EXECUTE ON FUNCTION public.sync_has_push_subscription()              FROM PUBLIC, anon, authenticated;

-- ── Re-assert the grants the app actually needs ──────────────────────────────
-- All five already carry an explicit authenticated=X/postgres, so revoking
-- PUBLIC leaves them working. Granted again anyway so this migration is
-- self-contained and idempotent rather than depending on prior state.
GRANT EXECUTE ON FUNCTION public.get_daily_profile_view_count(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_service_worker_details(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_site_activity(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_user_engagement(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_businesses_by_name(text)     TO authenticated, service_role;
