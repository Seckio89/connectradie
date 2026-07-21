# Security Scan — ConnecTradie — 2026-07-05

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `a93825b` (Merge PR #56 — assigned worker sees service).
**Git pull:** could not run — no git credentials in the automated environment. Scanned the local checkout, which is already at today's merge commit (PRs #17–#56 present since the last scan on 2026-07-02).
**Notification status:** **2 HIGH findings (both carried over, unchanged)** — push notification warranted per task rules, but no push/notify tool is available in this automated run. Flagging here for follow-up.

## Summary

Both HIGH findings from 2026-07-02 are **still open and unchanged**: the `send-email` authenticated open relay (anon-key trusted, spoofable `to` fallback) and the 6 dependency vulnerabilities (incl. `jspdf` critical, `ws` high). 40 PRs merged since the last scan (hiring/vacancies phases 1–4, team join-request fix, per-service worker assignment, landing/mobile work) introduced 9 new migrations; three new MEDIUM items came out of that review, including the first **ERROR-level live advisor** (`public_vacancies` SECURITY DEFINER view — deliberate, but now the loudest lint on the project) and an over-permissive self-insert policy on `business_team_members`. No exposed secrets, no new unsafe DOM sinks, no SQL injection, RLS coverage intact.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | 6 (3 new, 3 carried) |
| LOW      | 3 |

## Changes since last run (2026-07-02)

- **UNCHANGED HIGH — `send-email` open relay.** The auth block still trusts the public anon key (`isAnonKey` → skip user validation, index.ts ~399) and the spoofable `to` fallback is still accepted when `recipientUserId` is omitted (~434–448). The same anon-key trust remains in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`. Second consecutive run flagged; no fix merged.
- **UNCHANGED HIGH — dependency vulnerabilities.** `npm audit --omit=dev`: same 6 findings (1 critical `jspdf`, 1 high `ws`, 4 moderate `dompurify`/`react-router(-dom)`/`tar`). Lockfile versions unchanged since Jun 13. `npm audit fix` still available for most.
- **NEW MEDIUM — `business_team_members` self-insert policy is under-constrained** (PR #55, migration `20260705110000`). See MEDIUM #1.
- **NEW MEDIUM (advisor ERROR) — `public_vacancies` SECURITY DEFINER view** (PR #44, migration `20260704140000`). See MEDIUM #2.
- **NEW MEDIUM — `recurring_jobs.assigned_team_member_id` not validated against the owner's business** (PRs #52/#56). See MEDIUM #3.
- **NEW (LOW) — trigger functions exposed over RPC.** Advisors now also flag `notify_matching_tradies_new_vacancy` and `notify_service_assignment` as SECURITY DEFINER functions executable by `anon`/`authenticated` via `/rest/v1/rpc/`. PostgREST can't successfully invoke trigger functions (they error outside trigger context), so practical risk is low — but `EXECUTE` should be revoked to silence the exposure.
- **Confirmed clean in the new code:** no new `innerHTML`/`dangerouslySetInnerHTML`/`eval` sinks and no new auth-token `localStorage` usage in the 40-PR diff; every new table remains covered by RLS (69 unique `CREATE TABLE` / 70 `ENABLE ROW LEVEL SECURITY` across 230 migrations).

---

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02, unchanged)

`supabase/functions/send-email/index.ts`. Full analysis in the 2026-07-02 report; verified line-by-line this run — nothing changed:

1. Bearer = **anon key** (public, shipped in the browser bundle) skips user validation entirely ("likely Supabase cron scheduler — also trusted").
2. `recipientUserId` remains optional; a caller-supplied `to` is used verbatim ("accepted for the migration window").
3. `subject`/`body` caller-controlled; CTA `href` allows any http/https URL.
4. Sent from `notifications@connectradie.com` via Resend (DKIM-aligned).
5. Rate limit keyed per recipient (20/min) — unbounded across rotating recipients.

**Impact:** anyone with the frontend bundle can send convincing phishing from ConnecTradie's domain to arbitrary addresses. **Remediation (unchanged):** stop trusting the anon key as an internal principal (use service-role/shared secret for cron); make `recipientUserId` mandatory and drop the `to` fallback; restrict `metadata.link` to app origins; rate-limit per caller. Also remove the `token === supabaseAnonKey` pattern from the four reminder/cron functions.

## HIGH #2 — Vulnerable dependencies (6: 1 critical, 1 high, 4 moderate) — carried, unchanged

| Package | Severity | Issue | Reaches |
|---------|----------|-------|---------|
| `jspdf` | **Critical** | PDF object injection; HTML injection (GHSA-7x6v-j9x4-qf24, GHSA-wfv2-pwc8-crg5) | via `html2pdf.js` — invoice/receipt PDFs |
| `ws` | **High** | Uninitialized memory disclosure; DoS (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p) | via `@supabase/supabase-js` realtime |
| `dompurify` | Moderate | Multiple sanitizer bypasses (incl. GHSA-crv5-9vww-q3g8, prototype-pollution bypass) | the sanitizer the PDF path relies on |
| `react-router`/`react-router-dom` | Moderate | Open redirect via `//` path (GHSA-2j2x-hqr9-3h42) | app routing |
| `tar` | Moderate | PAX header file smuggling (GHSA-vmf3-w455-68vh) | build-time (`@capacitor/cli`) |

`npm audit fix` available; `html2pdf.js` still pins old `jspdf`/`dompurify`, so a `package.json` `overrides` block is likely needed. Recommend adding `npm audit` to CI — this is now the third run where versions haven't moved.

---

## MEDIUM

1. **NEW — Any authenticated user can insert themselves as an *active* team member of *any* business.** Migration `20260705110000_fix_team_join_request_rls.sql` adds `CREATE POLICY "Members can request to join a team" ... WITH CHECK (auth.uid() = member_profile_id)`. Only `member_profile_id` is constrained — `business_owner_id`, `status`, `role`, `invite_name`, `invite_email`, `trade_specialty` are all caller-chosen. A malicious user can insert a row with `status='active'` into any business's roster, appearing in the owner's My Team list and the "Assign Worker" dropdown with spoofed name/trade. Direct data exposure is nil (job/phase/service assignments remain owner-inserted), but it's a strong social-engineering primitive: an owner who assigns the planted "member" grants them read access to client services (names, addresses, schedules — see MEDIUM #3 policies) plus in-app notifications. **Fix:** tighten `WITH CHECK` to also require `status = 'pending_approval'` (or equivalent request state) and a sane default `role`, e.g. `WITH CHECK (auth.uid() = member_profile_id AND status = 'pending' AND ...)`; optionally require `profiles.employer_id = business_owner_id` linkage. `employer_approve_member` itself checks `employer_id = auth.uid()` correctly.

2. **NEW — `public_vacancies` view is SECURITY DEFINER — now an ERROR-level live advisor (lint 0010).** Migration `20260704140000` deliberately uses `security_invoker = false` so anon visitors can read a column-restricted projection of `trade_vacancies`/`profiles`/`tradie_details` for the public /careers pages. The column list is genuinely minimal (no emails/phones/addresses) and filtered to open, non-expired listings — the design is defensible. Two caveats: (a) it exposes the employer's **personal `full_name`** to anonymous crawlers when no business name exists — confirm that's intended for sole traders; (b) it is now the only ERROR-level advisor on the project, which will mask future ERROR-level regressions if the team habituates to it. Consider a Postgres-native alternative (e.g. a dedicated table refreshed by trigger, or `security_barrier` + documented lint suppression) or at minimum document the accepted risk.
   Ref: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

3. **NEW — `assigned_team_member_id` isn't validated to belong to the service's business.** `recurring_jobs.assigned_team_member_id` (migration `20260705100000`) is writable under the existing UPDATE policy (`auth.uid() IN (client_id, tradie_id)`) and FK-references *any* `business_team_members` row. A client or tradie can point it at a member of an unrelated business; the new SELECT policies in `20260705120000` then grant that stranger read access to the recurring job and its sessions, and the SECURITY DEFINER trigger notifies them. Mostly self-inflicted disclosure, but combined with MEDIUM #1 it lets planted members be assigned cross-business. **Fix:** add a `WITH CHECK`/trigger validating `business_team_members.business_owner_id = recurring_jobs.tradie_id`.

4. **CARRIED — SECURITY DEFINER functions executable by `anon`/`authenticated` (lints 0028/0029).** Same set as prior runs (now 20 WARNs incl. the two new trigger functions): anon-callable `get_daily_profile_view_count`, `has_user_engagement`, `search_businesses_by_name`; authenticated-callable incl. `delete_user_account`, `employer_approve_member`/`_decline_member`/`_remove_member`, `create_notification`, `is_admin`. Each must enforce internal authz; revoke `EXECUTE` where API exposure isn't intended. `create_notification` deserves priority review — if its internal check doesn't bind `p_user_id`, any user can spoof in-app notifications.

5. **CARRIED — `send-sms` recipient caller-controlled.** Real JWT required, but destination `to` from the request body with no ownership check. Resolve server-side.

6. **CARRIED — moderate dependency CVEs** (detail in HIGH #2).

## LOW

1. Trigger functions (`notify_matching_tradies_new_vacancy`, `notify_service_assignment`) exposed via RPC to `anon`/`authenticated` — not directly invocable as triggers, but revoke `EXECUTE` to clear the advisor noise.
2. Test fixture token string in `src/__tests__/setup.ts` (`access_token: 'test-token'`) — test-only, no action.
3. `.env.example` / `STRIPE_SETUP.md` key-shaped placeholders — documentation only, no action.

---

## Re-confirmed clean

- **Exposed secrets:** no live `sk_live_`/`sk_test_` values, no JWT-shaped tokens, no PEM/private keys anywhere in source. Placeholders only.
- **`.env` handling:** `.env` gitignored (line 23), untracked, absent from git history; only `.env.example` committed.
- **Service role key:** only via `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` in edge functions; zero occurrences in client `src/`.
- **RLS:** every created table has an explicit enable (69 tables / 70 enables across 230 migrations, incl. all 9 new ones); no RLS-disabled-table advisors.
- **Unsafe DOM:** no new `innerHTML`/`document.write`/`dangerouslySetInnerHTML`/`eval` in the 40-PR diff; existing sinks still route through `src/lib/escapeHtml.ts`.
- **SQL injection:** no raw SQL string interpolation; query builder / parameterized RPC throughout, including new migrations.
- **Auth-token storage:** no new `localStorage` usage in the diff; auth tokens not stored by app code.

## Scan coverage & method

- Git pull unavailable (no credentials); scanned local checkout at `master@a93825b` (today's merges present).
- Secret grep across the working tree (Stripe key patterns, JWT shape, service-role refs, credential assignments, PEM headers), excluding `node_modules`.
- `npm audit --omit=dev` executed (network available).
- All 9 migrations added since 2026-07-02 read in full; policy graph for `business_team_members` traced across 10 migrations.
- Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only): 1 ERROR, 20 WARN.
- `send-email` auth block re-verified line-by-line against the 2026-07-02 finding.

*Read-only scan. No files were modified, staged, committed, or pushed other than this findings log.*
