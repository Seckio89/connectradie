# Security Scan — ConnecTradie — 2026-07-02

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `4d4dd07` (Merge PR #16 — send-email recipient resolution).
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local checkout, which is already at today's merge commits (PRs #13–#16 present).
**Working tree:** shows 10 "modified" files, but the diff is **CRLF/LF-only** (`git diff --ignore-cr-at-eol` is empty) — line-ending noise, no content change. Security content of those files is intact.
**Notification status:** **2 HIGH findings** — a push notification is warranted per this task's rules, but no push/notify tool is available in this automated run, so it could not be dispatched. Flagging here for follow-up.

## Summary

Two HIGH items this run. First, `send-email` is effectively an **authenticated open email relay**: the recipient (`to`), subject, body, and CTA-button link are all caller-controlled, and the auth check is satisfied by the **public anon key** (or any signed-up user's JWT), so arbitrary emails can be sent from `notifications@connectradie.com` to any address — a domain-aligned phishing vector. Second, `npm audit` (runnable this time — network was available) reports **6 vulnerabilities incl. 1 critical (`jspdf`) and 1 high (`ws`)**; the two prior runs reported deps as "clean" only because audit could not run — a false negative, now corrected. No exposed secrets, no missing RLS, no SQL injection. The prior storage-bucket-listing MEDIUM is now **resolved** (advisor lint 0025 no longer fires — the migration reached prod).

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 |
| MEDIUM   | 3 groups |
| LOW      | 2 |

## Changes since last run (2026-07-01)

- **NEW HIGH — `send-email` open relay** (see below). The `to`/`subject`/`body`/CTA-link are caller-controlled and the anon key is accepted as a trusted principal. Merged PRs #15/#16 today added server-side `recipientUserId` resolution to stop address-spoofing, but left the spoofable `to` fallback in place, so the control is opt-in and does not close the hole. Not previously reviewed (prior scans didn't examine the email fns' auth model).
- **NEW HIGH — dependency vulnerabilities detected.** `npm audit --omit=dev` ran this time (prior runs couldn't reach the network). 6 findings, incl. `jspdf` critical and `ws` high. The package **versions have not changed** since the last scan (`package-lock.json` last touched Jun 13) — this is improved detection, not a regression.
- **RESOLVED — public storage buckets allow listing (was MEDIUM #1, two runs running).** Live security advisors no longer return lint 0025 for any of the 5 buckets. Migration `20260701000000_scope_public_bucket_select_policies.sql` has been applied to prod. Confirmed closed.
- **CONFIRMED HOLDING — print/export XSS hardening (fixed 2026-07-01) is merged and intact.** All `innerHTML` / `document.write` sinks route user/DB text through the shared `src/lib/escapeHtml.ts` (usage counts: Payouts 7, Leads 11, PaymentHistory 6, InvoiceViewModal 3, LicenseCertificate 2). No new raw sinks; no `dangerouslySetInnerHTML`, no `eval`/`new Function`.
- **Email-template hardening (PR #15) confirmed:** `send-email` and `send-invoice-approval-nudge` HTML-escape all interpolated fields (subject, body, category, suburb, names, amounts, dates) and gate the CTA `href` through a `safeHref` http/https allow-list. The XSS-in-email class is handled; the relay/authorization issue below is separate.
- **RLS counts:** 69 `CREATE TABLE` / 69 `ENABLE ROW LEVEL SECURITY` / 479 `CREATE POLICY` across 221 migration files — no table created without RLS. (Prior runs reported 70/70; the difference is a counting artifact of the regex, not a dropped RLS-enable — every created table still has an explicit enable.)

---

## HIGH #1 — `send-email` is an authenticated open email relay (spoofing / phishing from the ConnecTradie domain)

**File:** `supabase/functions/send-email/index.ts` (auth block lines ~381–413, recipient resolution lines ~427–451, CTA link ~161/`ctaButton` ~141).

**The chain:**
1. **Auth is satisfiable with a public credential.** The function accepts the service-role key, *or* a user JWT, *or* the **anon key** — and if the bearer token equals the anon key it **skips user validation entirely** (comment: *"Anon key: likely Supabase cron scheduler — also trusted"*, lines ~399–403). The anon key is **not secret**: it is `VITE_SUPABASE_ANON_KEY`, shipped in the browser bundle by design. So anyone who reads the frontend JS can authenticate to this endpoint. (Even without the anon-key path, any user who signs up gets a JWT that passes.)
2. **The recipient is caller-controlled.** `recipientUserId` (server-side lookup, non-spoofable) is **optional**. If the caller omits it and supplies `to`, the code uses `to.trim()` verbatim with no allow-list (`let recipientEmail = typeof to === "string" ? to.trim() : ""`, lines ~434–448). So the anti-spoofing control added in PR #16 is bypassed by simply not sending `recipientUserId`.
3. **Content is caller-controlled.** `subject` and `body` are attacker-supplied (escaped as text — fine against HTML injection, but plaintext is all phishing needs). The CTA button's `href` comes from `metadata.link` and passes `safeHref`, which allows **any** `http:`/`https:` URL — so the "View in App"-style button can point at an attacker's site.
4. **From a trusted, domain-aligned sender.** Mail is sent via Resend from `notifications@connectradie.com`. With the platform's DKIM/SPF, these pass authentication and land in inboxes looking fully legitimate.
5. **Rate limit is weak against this abuse.** 20/min keyed per-recipient (`${recipientEmail}-send-email`) — an attacker rotating recipients is effectively unbounded.

**Impact:** an unauthenticated-in-practice attacker can send convincing phishing/spam from ConnecTradie's own domain to arbitrary addresses (including the platform's real users), with an attacker-controlled call-to-action link. Reputational + credential-phishing risk; potential Resend cost/abuse and domain-reputation damage.

**Suggested remediation (not applied — read-only scan):**
- Do **not** treat the anon key as a trusted internal principal. For cron/internal calls use the service-role key (or a dedicated shared secret); require a real user JWT otherwise. The same `token === supabaseAnonKey` trust exists in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders` — those derive recipients server-side so impact is lower, but the pattern should be removed everywhere.
- Make `recipientUserId` **mandatory** and drop the raw `to` fallback (resolve every address server-side), so a caller can never choose an arbitrary destination.
- Consider restricting `metadata.link` to the app's own origin(s) rather than any https URL, and tightening the rate limit to key on the caller identity as well as the recipient.

Ref: this is a broken-authorization / mail-relay issue, related to OWASP A01 (Broken Access Control) and email-spoofing abuse.

## HIGH #2 — Vulnerable dependencies (6, incl. 1 critical, 1 high) — detected by `npm audit`

`npm audit --omit=dev` completed this run (network available; the two prior runs explicitly could not run it and therefore reported "no known-vulnerable packages" — that was a false negative). Runtime-affecting items:

| Package | Locked | Severity | Issue | Reaches |
|---------|--------|----------|-------|---------|
| `jspdf` | 4.2.0 | **Critical** | PDF object injection via FreeText color; HTML injection in new-window paths (GHSA-7x6v-j9x4-qf24, GHSA-wfv2-pwc8-crg5) | via `html2pdf.js` — the invoice/receipt PDF path the team just hardened for XSS |
| `ws` | 8.18.3 | **High** | Uninitialized memory disclosure; memory-exhaustion DoS (GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p) | via `@supabase/supabase-js` → `realtime-js` (browser realtime) |
| `dompurify` | 3.3.2 | Moderate | Multiple sanitizer bypasses (ADD_TAGS/FORBID_TAGS, SAFE_FOR_TEMPLATES, IN_PLACE, prototype pollution) | via `html2pdf.js`/`jspdf` — notable because it *is* the sanitizer the PDF path relies on |
| `react-router` / `react-router-dom` | 6.30.3 | Moderate | Open redirect via protocol-relative `//` path (GHSA-2j2x-hqr9-3h42) | app routing/redirects |
| `tar` | 7.5.11 | Moderate | PAX header file-smuggling (GHSA-vmf3-w455-68vh) | via `@capacitor/cli` — build-time only, low runtime exposure |

**Why HIGH overall:** the `jspdf`+`dompurify` chain sits directly under `html2pdf.js`, which generates invoices/receipts from user/DB-controlled data — the exact surface the recent XSS work is protecting. A bypass in the sanitizer that path trusts undercuts that hardening. `ws` is reachable through the Supabase realtime client in the browser.

**Suggested remediation:** `npm audit fix` resolves most (e.g. `jspdf` 4.2.1, `react-router-dom` 7.x is the audited fix line — check for breaking changes before bumping the major; `ws` via a `@supabase/supabase-js` bump; `dompurify` via override). `html2pdf.js` remains at 0.14.0 (no newer release), so `jspdf`/`dompurify` likely need a `package.json` `overrides` block. Add `npm audit` to CI so this is caught continuously rather than only when a scan happens to have network.

---

## MEDIUM

1. **`SECURITY DEFINER` functions executable by `anon` / `authenticated` (Supabase advisor, lint 0028/0029).** 16 functions flagged (WARN, EXTERNAL). Anon-callable: `get_daily_profile_view_count`, `has_user_engagement`, `search_businesses_by_name`. Authenticated-callable set includes sensitive-looking ops — `delete_user_account`, `employer_approve_member` / `_decline_member` / `_remove_member`, `create_notification`, `can_read_job_attachment`, `is_admin`. These run with owner privileges; each must enforce its own internal authorization (e.g. verify the caller owns the employer org before approving a member, verify self before `delete_user_account`). Review each for internal authz and revoke `EXECUTE` / switch to `SECURITY INVOKER` where public/authenticated access isn't intended. Carried from prior runs (unchanged).
   Ref: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

2. **`send-sms` recipient is caller-controlled.** `supabase/functions/send-sms/index.ts` requires a genuine user JWT (`auth.getUser`, does **not** trust the anon key — better than `send-email`), but the destination `to` phone number is still taken from the request body with no server-side ownership check. Any signed-up user can send SMS (from the platform's Twilio number, 10/min per number) to arbitrary numbers. Lower reach than HIGH #1 (needs a real account, costs money to abuse) but the same "resolve the recipient server-side" fix applies.

3. **Moderate dependency CVEs** (`dompurify`, `react-router`/`react-router-dom`, `tar`) — detail in HIGH #2 table. Grouped here by severity; address alongside the critical/high bumps.

## LOW

1. **Test fixture token string.** `src/__tests__/setup.ts:18` mocks a session with `access_token: 'test-token'`. Not a real secret; test-only. No action beyond awareness.
2. **`.env.example` / `STRIPE_SETUP.md` contain key-shaped placeholders** (`sk_test_your_secret_key_here`, etc.). Documentation placeholders, not live values. No action.

---

## Re-confirmed clean

- **Exposed secrets:** no live `sk_live_`/`sk_test_`/`rk_live_`/`whsec_` values, no full private-key JWTs, no PEM/p12/keystore files in source. Only placeholders in `.env.example` and `STRIPE_SETUP.md`.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders).
- **Service role key:** `SUPABASE_SERVICE_ROLE_KEY` appears only in server-side edge functions via `Deno.env.get(...)`; **zero** occurrences in client `src/`.
- **RLS:** every created table has an explicit `ENABLE ROW LEVEL SECURITY`; 479 policies; **no ERROR-level** live advisors (no RLS-disabled table exposed to the API). Storage bucket-listing (lint 0025) now resolved.
- **SQL injection:** no raw SQL string interpolation; all DB access via the Supabase query builder / parameterized RPC. (The two `${...}` hits in edge functions are interpolating error *messages* into JSON responses, not SQL.)
- **Unsafe DOM:** no `eval`/`new Function`, no `dangerouslySetInnerHTML`; all `innerHTML`/`document.write` sinks escape user/DB input via `src/lib/escapeHtml.ts`.
- **Auth-token storage:** `localStorage` used only for UI prefs (banner/tour dismissal, quote-message template, dedupe flags) — no auth tokens stored there by app code.
- **Stripe webhook:** intentional `verify_jwt = false` for `stripe-webhook` and `google-calendar-oauth`; both do their own signature / CSRF verification.

## Scan coverage & method

- Git pull unavailable (no credentials); scanned local checkout at `master@4d4dd07` (today's merges present). Working-tree "changes" are CRLF-only (verified with `--ignore-cr-at-eol`).
- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `e2e/`, `index.html`, config files (excluded `node_modules`, archives, lockfile, `dist`, `android`).
- `npm audit --omit=dev` executed successfully (network available this run).
- Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only).
- Edge-function auth models reviewed (`send-email`, `send-sms`, `send-invoice-approval-nudge`, and the anon-key-trusting cron functions). Local migrations analysed for RLS coverage.

*Read-only scan. No files were modified, staged, committed, or pushed other than this findings log.*
