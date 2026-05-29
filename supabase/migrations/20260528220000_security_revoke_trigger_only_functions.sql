-- Second-pass security hardening — lock down SECURITY DEFINER functions that
-- have no legitimate RPC caller. These either:
--   - Fire from pg triggers (which run as the function owner regardless of
--     the caller's EXECUTE grant), so revoking from anon/authenticated
--     closes the RPC attack surface without breaking the trigger.
--   - Are called only from pg_cron (which uses service_role, unaffected by
--     anon/authenticated grants).
--   - Are used only inside RLS policy expressions (which PostgreSQL evaluates
--     as the function owner during policy enforcement, again unaffected).
--
-- Functions that the frontend genuinely calls via RPC are NOT touched here:
--   - create_notification (Onboarding.tsx, Team.tsx)
--   - get_daily_profile_view_count, has_user_engagement (contactGating.ts)
--   - search_businesses_by_name (Onboarding.tsx)
-- Those remain callable by authenticated; the warning persists for them by
-- design until either the function is audited or refactored.

-- Trigger-only — revoke from everyone except service_role/postgres.
REVOKE EXECUTE ON FUNCTION public.decrement_quote_count()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.increment_quote_count()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_client_new_quote()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_employer_new_application() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_tradie_invoice_ready()     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_tradies_on_new_job()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.schedule_reminder_on_completion() FROM anon, authenticated, public;

-- Cron-only — revoke from everyone except service_role/postgres.
REVOKE EXECUTE ON FUNCTION public.notify_approaching_reminders()    FROM anon, authenticated, public;

-- Used only inside RLS policy expressions — revoke from anon. Keep callable
-- by authenticated only for the policies themselves (Postgres evaluates RLS
-- function calls as the function owner, but EXECUTE grants still affect
-- whether the policy itself can call them; in practice authenticated needs
-- the grant to enable the policy-protected reads from the frontend).
REVOKE EXECUTE ON FUNCTION public.get_user_conversation_ids(uid uuid)               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(conv_id uuid, user_id uuid) FROM anon, public;
