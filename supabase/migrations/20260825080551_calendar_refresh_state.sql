-- ─────────────────────────────────────────────────────────────────────────────
-- calendar_integrations — record what happened the last time we asked Google
-- for a new access token.
--
-- WHY THIS EXISTS. Until now a Google Calendar integration had exactly two
-- observable states: a row exists, or it does not. When a refresh failed the
-- row survived untouched, `sync_enabled` stayed true, and the dashboard went on
-- offering "Sync Google Calendar" for a connection that could never succeed
-- again. The only trace was a console.error in the edge logs, which Supabase
-- retains for 24 hours.
--
-- That is how the 2026-07-28 breakage cost six days (see
-- _shared/googleTokenError.ts), and it is why the 2026-08-20 failure could not
-- be diagnosed afterwards: by the time anyone looked, the log line naming the
-- cause was gone and nothing in the database had changed. A refresh outcome
-- that is not written down did not happen.
--
-- needs_reconnect IS SET ONLY WHEN RECONNECTING IS ACTUALLY THE FIX — that is
-- invalid_grant, or a row with no saved refresh token at all. The two failures
-- Google actually returns need opposite responses and must not be collapsed:
--
--   invalid_grant   the saved authorisation is dead (revoked, consent
--                   withdrawn, or expired — Google caps refresh tokens at 7
--                   days while the OAuth consent screen is in "Testing"
--                   publishing status). Reconnecting mints a new one, so this
--                   is the only case where asking the tradie to reconnect is
--                   honest.
--   invalid_client  GOOGLE_CLIENT_SECRET does not match the OAuth client.
--                   Reconnecting cannot help — the reconnect fails the same
--                   way — so this sets the error columns and leaves
--                   needs_reconnect false. Telling a tradie to reconnect here
--                   sends them round a loop that cannot terminate.
--
-- Anything else — a transient 5xx, or an HTML error page from a proxy, which
-- parses as code "unknown" — records the error columns and leaves
-- needs_reconnect false. The next sync simply works, and nagging a tradie to
-- reconnect over a blip is how a real reconnect prompt stops being believed.
--
-- WHAT GOES IN last_refresh_error. The already-truncated 300-char `detail` from
-- parseGoogleTokenError, which reads Google's RESPONSE body only. Those bodies
-- are {error, error_description} and carry no credentials. The request body —
-- which carries client_secret and the refresh token — is never passed to it and
-- must never be stored here.
--
-- NO NEW RLS POLICY, DELIBERATELY. This table already has RLS enabled and four
-- owner-scoped policies (20260131123044_add_calendar_integrations.sql:36-65,
-- rewritten for planner performance in
-- 20260218132419_fix_rls_part2a_notifications_calendar.sql). Postgres policies
-- are row-scoped, so they already cover every column of the row including the
-- five added here. Adding a policy is what would open a hole, not omitting one.
--
-- One consequence worth stating rather than discovering later: the pre-existing
-- owner UPDATE policy lets a tradie clear needs_reconnect on their own row from
-- the browser. That hides a banner from themselves; it cannot mint a token or
-- make a dead grant work, so it is not a privilege boundary. (The broader
-- question — that the same policies expose the plaintext token columns to the
-- browser — is a separate ticket and is not touched here.)
--
-- NO INDEX. Single-digit row count, and every read is already by tradie_id
-- through the unique (tradie_id, provider) constraint. See
-- 20260218133427_drop_unused_indexes_and_add_missing_fk.sql for what happens to
-- indexes nothing uses.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.calendar_integrations
  ADD COLUMN IF NOT EXISTS last_refresh_ok_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_refresh_error_code text,
  ADD COLUMN IF NOT EXISTS last_refresh_error      text,
  ADD COLUMN IF NOT EXISTS last_refresh_error_at   timestamptz,
  ADD COLUMN IF NOT EXISTS needs_reconnect         boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.calendar_integrations.last_refresh_ok_at IS
  'When Google last returned a new access token. NULL means refresh has never succeeded on this row.';
COMMENT ON COLUMN public.calendar_integrations.last_refresh_error_code IS
  'Google OAuth error code from the last failed refresh, e.g. invalid_grant. NULL once a refresh succeeds.';
COMMENT ON COLUMN public.calendar_integrations.last_refresh_error IS
  'Truncated Google error response body from the last failed refresh. Never contains credentials.';
COMMENT ON COLUMN public.calendar_integrations.last_refresh_error_at IS
  'When the last refresh failure happened.';
COMMENT ON COLUMN public.calendar_integrations.needs_reconnect IS
  'True only when reconnecting is the actual fix: invalid_grant, or no saved refresh token. Never set for invalid_client (a wrong secret) or transient errors.';
