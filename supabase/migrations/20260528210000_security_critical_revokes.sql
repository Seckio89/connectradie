-- Production security hardening — pre-launch critical fixes from Supabase
-- Security Advisor. Closes the three highest-risk findings:
--
--   1. simulate_payment_success(uuid) — a test backdoor that mutates job
--      financial state, callable by anyone on the internet via /rest/v1/rpc.
--      DROP unconditionally; any code path still relying on it should be using
--      the real Stripe webhook flow instead.
--
--   2. SECURITY DEFINER functions callable by anon (and in some cases
--      authenticated). Each is scoped to the smallest role set that the app
--      actually needs:
--        - Trigger-only functions: revoke from anon + authenticated entirely.
--          They fire from pg triggers, not RPC — no client should call them.
--        - User-account RPCs (delete_user_account, employer_*): keep callable
--          by authenticated, revoke from anon.
--        - Payment-write RPCs (create_payment_request overloads): not used by
--          the frontend (grep confirmed zero call sites in src/). Revoke from
--          anon + authenticated; if needed later it must be re-granted with a
--          narrower function body that checks auth.uid() ownership first.
--        - Internal helpers (is_admin, is_tradie_verified): revoke from anon;
--          keep callable by authenticated (used inside other policies/queries).
--
--   3. Broad storage.objects SELECT policies on `documents` and
--      `job-attachments` that allowed any client to enumerate the bucket
--      contents. The app reads individual files via getPublicUrl (CDN-served,
--      unaffected by RLS), so dropping the listing policy closes the warning
--      without breaking UI. A follow-up migration should move these buckets
--      to private + signed URLs for genuine PII protection.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Drop the test backdoor
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.simulate_payment_success(p_job_id uuid);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Lock down SECURITY DEFINER function execution
-- ──────────────────────────────────────────────────────────────────────────

-- Trigger-only: revoke EVERYTHING. These fire from pg triggers; no RPC needed.
REVOKE EXECUTE ON FUNCTION public.flip_job_to_three_stage_flow() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_quote_acceptance()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM anon, authenticated, public;

-- Cron-only: locked to service_role / postgres (which are unaffected by REVOKE from anon/auth).
REVOKE EXECUTE ON FUNCTION public.auto_complete_ended_projects()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_old_declined_jobs()      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_assign_project_to_job()    FROM anon, authenticated, public;

-- Payment-write RPC: not called from the frontend. Revoke entirely; if it
-- becomes needed, re-grant with a narrower auth.uid() check inside the body.
REVOKE EXECUTE ON FUNCTION public.create_payment_request(p_job_id uuid, p_amount bigint)  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_payment_request(p_job_id uuid, p_amount integer) FROM anon, authenticated, public;

-- User-account RPCs: anon must not call. authenticated is the legitimate caller.
REVOKE EXECUTE ON FUNCTION public.delete_user_account()                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_approve_member(member_id uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_decline_member(member_id uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_remove_member(member_id uuid)  FROM anon, public;

-- Internal predicates: anon should never call. authenticated is fine
-- (they're used by RLS policies and frontend conditionals).
REVOKE EXECUTE ON FUNCTION public.is_admin()                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tradie_verified(p_user_id uuid)  FROM anon, public;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Drop overly-broad storage listing policies
-- ──────────────────────────────────────────────────────────────────────────
-- Both kept their bucket=public flag so CDN public URLs still resolve;
-- only the SDK-based listing/listing+download path is closed.
DROP POLICY IF EXISTS "Anyone can view documents"                  ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view job attachments" ON storage.objects;
