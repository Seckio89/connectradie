# Security Scan — ConnecTradie — 2026-07-04

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `1629bdb` (Merge PR #39 — landing section alignment).
**Git pull:** could not run — no git credentials in the automated environment. Scanned the local checkout, which already contains today's merges (PRs #24–#39 present).
**Working tree:** modified files are CRLF/LF-only noise (`git diff --ignore-cr-at-eol` is empty) — no content changes.
**Notification status:** **2 HIGH findings (both carried over, unchanged)** — per task rules a push notification is warranted, but no push/notify tool is available in this automated run. Flagged here for follow-up.

## Summary

**No new issues since the 2026-07-03 scan.** Both HIGH findings remain open and unchanged. Sixteen PRs merged since (#24–#39): mostly landing-page/mobile UI work, plus **one new payments edge function (`stripe-payout-settings`, PR #29) — reviewed in full today, auth model is solid** (two LOW notes below).

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH     | 2 | carried from 2026-07-02, unchanged |
| MEDIUM   | 3 groups | carried, unchanged |
| LOW      | 4 | 2 carried + 2 new (new payout function, informational) |

## Changes since last run (2026-07-03)

- **New edge function `stripe-payout-settings` (PR #29)** — tradie self-service payout settings (bank update link, payout schedule). Full review below: authentication, authorization, and rate limiting all correctly implemented. Two LOW observations.
- **`stripe-connect-account` extended (PR #29)** — now also returns the tradie's masked bank details (last4, bank name, BSB/routing number) and payout schedule. Auth unchanged (user JWT validated); data returned only for the caller's own account. LOW note below.
- **HIGH #1 (send-email open relay) — still open.** Re-verified today: anon-key-trust block (`isAnonKey`, lines 399–403) and spoofable `to` fallback (`to.trim()`, line 434) both still present.
- **HIGH #2 (dependency vulnerabilities) — still open.** `npm audit --omit=dev` re-run: **6 vulnerabilities (1 critical, 1 high, 4 moderate)** — identical to yesterday; `package-lock.json` unchanged.
- **Supabase live advisors — unchanged.** Same 16 WARN-level SECURITY DEFINER lints (3 anon-callable, 13 authenticated-callable). Zero ERROR-level advisors.

---

## Review: new `stripe-payout-settings` function (PR #29)

Auth model verified line-by-line:

- Requires `Authorization: Bearer <token>`; validates a real user via `auth.getUser(token)` — does **not** trust the anon key (unlike `send-email`).
- Server-side profile lookup enforces `role === 'tradie'`; the Stripe account ID comes from the caller's own `profiles.stripe_connect_account_id`, never from the request body — no cross-account access possible.
- Rate limited (10 req/min per user). Schedule interval validated against an allow-list. All Stripe calls server-side.

LOW observations (no action required, worth knowing):

1. **Caller-supplied `refreshUrl`/`returnUrl`** are passed to `stripe.accountLinks.create` unvalidated. Only exploitable against the authenticated caller themselves (self-redirect), so impact is negligible — but restricting to `https://connectradie.com/*` would match the defense already recommended for `send-email` links.
2. **Raw error passthrough:** the catch-all returns `err.message` to the client. Intentional (surfaces Stripe schedule-rejection reasons) but may leak internal detail on unexpected failures. Consider an allow-list of known Stripe messages.

Also noted: `stripe-connect-account` now returns the bank **routing number (BSB)** alongside last4/bank name for in-app display. BSBs are low-sensitivity (public bank identifiers), returned only to the account owner — informational only.

## HIGH #1 (carried) — `send-email` is an authenticated open email relay

**File:** `supabase/functions/send-email/index.ts`. Full analysis in the 2026-07-02 report; re-confirmed in today's source:

1. A Bearer token equal to the **public anon key** skips user validation entirely (lines 399–403) — the anon key ships in the browser bundle, so this is unauthenticated in practice.
2. `recipientUserId` remains optional; omitting it falls back to caller-supplied `to.trim()` (line 434) with no allow-list.

Combined with caller-controlled subject/body and an any-https CTA link, this permits phishing from `notifications@connectradie.com`. Remediation (unchanged): stop trusting the anon key, make `recipientUserId` mandatory, drop the `to` fallback, restrict `metadata.link` to app origins. Same anon-key-trust pattern remains in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

## HIGH #2 (carried) — Vulnerable dependencies: 6 prod (1 critical, 1 high, 4 moderate)

`npm audit --omit=dev`, re-run 2026-07-04 — identical to prior runs:

| Package | Locked | Severity | Reaches |
|---------|--------|----------|---------|
| `jspdf` | 4.2.0 | **Critical** | via `html2pdf.js` — invoice/receipt PDF generation (PDF object/HTML injection) |
| `ws` | 8.18.3 | **High** | via `@supabase/supabase-js` realtime |
| `dompurify` | 3.3.2 | Moderate | sanitizer the PDF path relies on |
| `react-router` / `react-router-dom` | 6.30.3 | Moderate | open redirect via `//` path |
| `tar` | 7.5.11 | Moderate | build-time only (`@capacitor/cli`) |

Full audit (incl. dev deps) shows 18: adds `vitest` (critical, dev-only UI server file read), `vite` 7.3.1 (high, dev server path traversal — bump to ≥7.3.4), `flatted`, `picomatch`, `undici`, and several moderates. Dev-only exposure, but the `vite`/`vitest` bumps are cheap.

Remediation unchanged: `npm audit fix` for most; `jspdf`/`dompurify` likely need a `package.json` `overrides` block since `html2pdf.js` 0.14.0 has no newer release; add `npm audit` to CI.

## MEDIUM (all carried, unchanged)

1. **16 SECURITY DEFINER functions executable by `anon`/`authenticated`** (advisor lints 0028/0029, WARN, EXTERNAL). Anon-callable: `get_daily_profile_view_count`, `has_user_engagement`, `search_businesses_by_name`. Authenticated-callable includes `delete_user_account`, `employer_approve_member`/`_decline_member`/`_remove_member`, `create_notification`, `is_admin`, etc. Each must enforce internal authorization; review and revoke `EXECUTE` where not intended. Remediation: [lint 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
2. **`send-sms` recipient caller-controlled** — requires a real user JWT but `to` phone number comes from the request body with no ownership check.
3. **Moderate dependency CVEs** — see HIGH #2 table.

## LOW

1. *(carried)* Test fixture token string in `src/__tests__/setup.ts` — test-only, no action.
2. *(carried)* Key-shaped placeholders in `.env.example` / `STRIPE_SETUP.md` — documentation, no action.
3. *(new)* `stripe-payout-settings`: unvalidated `refreshUrl`/`returnUrl` (self-redirect only) — see review above.
4. *(new)* `stripe-payout-settings`: raw `err.message` returned to client — see review above.

## Re-confirmed clean (re-scanned today)

- **Exposed secrets:** no live `sk_live_`/`sk_test_`/`whsec_` values, no private-key JWTs, no PEM/private keys, no hardcoded password/secret/api_key assignments in `src/`, `supabase/`, config files. The only JWT found in built assets (`dist/`, `android/` — both untracked) decodes to `role: "anon"` — the public anon key, safe by design.
- **`.env` handling:** `.env` gitignored, not tracked, absent from git history. Only `.env.example` committed (placeholders).
- **Service role key:** zero occurrences in client `src/`; edge functions read it via `Deno.env.get` only.
- **RLS:** 69/69 tables created in migrations have explicit `ENABLE ROW LEVEL SECURITY`. Zero ERROR-level live advisors.
- **SQL injection:** no raw SQL string interpolation; all DB access via query builder / parameterized RPC.
- **Unsafe DOM:** no `eval`/`new Function`/`dangerouslySetInnerHTML`. Two `innerHTML` sinks (`InvoiceViewModal.tsx`, `Payouts.tsx`) re-checked: both build offscreen PDF containers from already-React-rendered DOM or explicitly HTML-escaped values.
- **Auth-token storage:** `localStorage` used only for UI prefs/dedupe flags — no auth tokens stored by app code.
- **Stripe webhook:** signature verified via `constructEventAsync`. `verify_jwt = false` only for `stripe-webhook` and `google-calendar-oauth` — both documented and justified in `config.toml`.

## Scan coverage & method

Local checkout scanned at `master@1629bdb` (git pull unavailable — no credentials; checkout already current with today's merges). Secret grep across source/config (excluding `node_modules`, `dist`, archives, lockfile). `npm audit` executed (prod-only and full). Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only). New/changed edge functions since last scan reviewed in full (`stripe-payout-settings`, `stripe-connect-account`); migrations analysed for RLS coverage.

*Read-only scan. No files modified, staged, committed, or pushed other than this findings log.*
