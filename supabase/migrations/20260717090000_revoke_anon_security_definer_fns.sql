-- Migration: revoke_anon_security_definer_fns
-- Type: Security hardening (function grants)
-- Description: Supabase advisor 0028/0029 — SECURITY DEFINER functions were
-- executable by anon (and in two cases needlessly by authenticated) via
-- /rest/v1/rpc/*. Revoke EXECUTE where public access is not intended.
--
-- Deliberately NOT revoked:
--   * search_businesses_by_name — powers public SEO/browse pages (anon search)
--   * create_notification — has full internal authorization checks (caller must
--     share a job / recurring service / conversation with the target, or be
--     self/admin/service_role); revoking would break client-side notification flows
--   * other authenticated-callable helpers (is_admin, is_tradie_verified, etc.)
--     — used by RLS policies and client code under authenticated sessions

-- ============================================================
-- 1. TRIGGER FUNCTIONS — never callable as RPC by any user role
-- ============================================================
-- These RETURN trigger; PostgREST cannot invoke them, but revoking EXECUTE
-- clears the advisor warning and removes any ambiguity. Trigger firing does
-- NOT require the invoking user to hold EXECUTE (checked at trigger creation
-- against the table owner), so existing triggers are unaffected.
REVOKE EXECUTE ON FUNCTION public.enforce_external_pay_tier() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_offplatform_payment() FROM anon, authenticated;

-- ============================================================
-- 2. DATA-PROBE FUNCTIONS — remove anon access, keep authenticated
-- ============================================================
-- Unauthenticated users should never be able to probe user/team data.
REVOKE EXECUTE ON FUNCTION public.get_daily_profile_view_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_service_worker_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_site_activity(timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_user_engagement(uuid) FROM anon;

-- ============================================================
-- 3. PREVENT FUTURE DEFAULT GRANTS TO anon ON NEW FUNCTIONS
-- ============================================================
-- New functions in public get EXECUTE granted to anon by default via
-- default privileges. Keep the default for authenticated (app relies on RPC),
-- but stop auto-granting to anon; public functions must opt in explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
