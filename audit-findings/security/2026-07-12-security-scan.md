# Security Scan — ConnecTradie — 2026-07-12

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `69256f0` (chore(security): add CSP (report-only) + security headers at hosting layer). **Working tree:** dirty — 114 uncommitted paths (Android build files, scripts, `src/App.tsx`, `public/service-worker.js`, prior scan reports, etc.).
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree.
**Gap note:** no scan file exists for 2026-07-11; last prior report is 2026-07-10. Deltas below are measured against 2026-07-10.
**Notification status:** **1 HIGH finding present** (vulnerable production dependencies). Push warranted per task rules, but no push/notify tool is available in this automated run — flagged here for follow-up.

## Summary

No exposed credentials, no `.env` leakage, no SQL injection, and RLS coverage remains complete (73 `CREATE TABLE` / 73 `ENABLE ROW LEVEL SECURITY` across local migrations — 1:1). Two findings that were open on 2026-07-10 are now **REMEDIATED**: the `send-email` open-relay (was HIGH #1) and the `google-calendar-oauth` weak CSRF state (was MEDIUM #1). One HIGH remains and is unchanged: the vulnerable production dependency set. Net open severity dropped from 2 HIGH to 1 HIGH.

| Severity | Count | Change since 2026-07-10 |
|----------|-------|--------------------------|
| CRITICAL | 0 | — |
| HIGH     | 1 (deps, carried, unchanged) | −1 (send-email relay fixed) |
| MEDIUM   | 1 (cron anon-key trust, reduced from prior HIGH grouping) + carried advisor items | OAuth-state MEDIUM fixed |
| LOW      | 2 (unchanged) | — |

## Changes since last run (2026-07-10)

- **FIXED — `send-email` open relay (was HIGH #1).** The function was rewritten. The public anon key is no longer trusted to send to a raw `to`. Trust tiers are now explicit: only the service-role key is fully trusted; a user JWT may only email an address it owns as a saved `client_contact` (verified via `owner_id = callerUserId` + `ilike` with escaped metachars, `send-email/index.ts:524–550`); a caller with only the public anon key and no user JWT is rejected with 403 when supplying a raw `to` (`:530`). `recipientUserId` triggers a server-side address lookup that the caller cannot spoof (`:510–523`). The arbitrary-recipient phishing/reputation risk is closed.
- **FIXED — `google-calendar-oauth` CSRF state (was MEDIUM #1).** State is now HMAC-signed: `state = "<userId>.<expiresAtMs>.<hmac(userId.expiresAtMs)>"`, verified on callback by `verifyState()` (`google-calendar-oauth/index.ts:18–59`). The raw-user-ID-as-state weakness (attacker substituting a victim UUID) is resolved; expired or tampered state is rejected.
- **HIGH (deps) unchanged** — `npm audit --omit=dev` still reports 6 production vulnerabilities: 1 critical, 1 high, 4 moderate. Identical set to 2026-07-08 through 07-10. No `npm audit fix` has been run.
- **RLS coverage** — still 73/73, no table without RLS.
- **Hosting-layer hardening added** — current HEAD adds a report-only CSP and security headers at the hosting layer (`vercel.json`). Positive; not yet enforcing (report-only).

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `index.html`, and `android/` assets (excluded `node_modules`, `dist`, archives, lockfile). Patterns: `sk_live_`/`sk_test_`, `whsec_`, `rk_`, Google `AIza…`, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`, `BEGIN … PRIVATE KEY`, and `password`/`secret`/`api_key`/`token` literal assignments.
- `.gitignore` / git tracking / git history checked for `.env`.
- Local migrations analysed for RLS coverage (CREATE TABLE vs ENABLE RLS).
- Edge functions reviewed for auth model and SQL-injection risk; `send-email` and `google-calendar-oauth` re-read in full given prior findings.
- `npm audit` (full + `--omit=dev`) run against the lockfile (no network install).
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); git pull (no credentials).

---

## CRITICAL — none

- **Exposed secrets:** none. No Stripe secret keys (`sk_`/`rk_`/`whsec_`), no Google `AIza…` keys, no credential JWTs, no private keys in source or the working-tree diff. Only secret-shaped strings are placeholders in `.env.example`.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders only — verified this run).
- **Service-role key:** zero occurrences of `SERVICE_ROLE`/`service_role` in client `src/`. Server-only via `Deno.env.get(...)`.
- **Client env vars:** all `VITE_*` vars referenced in `src/` are public-safe (Supabase URL + anon key, Stripe **publishable** key + price IDs, Google Maps key, Google web client ID, GA measurement ID, Sentry DSN, VAPID **public** key). No secret exposed to the client.

## HIGH #1 — Vulnerable production dependencies (carried from 2026-07-02+, unchanged)

`npm audit --omit=dev` reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate. All have fixes available.** (Full-tree audit, incl. dev deps: 18 total — 2 critical, 5 high, 9 moderate, 2 low.)

| Package | Severity | Path / reaches | Note |
|---------|----------|----------------|------|
| `jspdf` (via `html2pdf.js@^0.14.0`) | **Critical** | invoice/receipt/payout PDF generation | PDF object injection via FreeText color; HTML injection in new-window paths |
| `ws` (via `@supabase/supabase-js@^2.57.4` realtime) | **High** | realtime socket | Uninitialized memory disclosure; memory-exhaustion DoS from tiny fragments |
| `dompurify` (via `html2pdf.js`) | Moderate | PDF sanitizer | Numerous FORBID_TAGS / IN_PLACE / template / prototype-pollution bypasses |
| `react-router` / `react-router-dom@^6.30.3` | Moderate | routing | Open redirect via protocol-relative `//` URL |
| `tar` (transitive) | Moderate | build/tooling | PAX header parser differential (file smuggling) |

**Remediation (unchanged):** run `npm audit fix`, redeploy, re-audit. Prioritise `jspdf` and `ws` (both on live user-facing paths). Wire `npm audit --omit=dev` into CI to catch regressions.

## MEDIUM

1. **Cron/reminder edge functions accept the public anon key as authorization (reduced from prior HIGH grouping).** `generate-recurring-sessions:87`, `send-invoice-reminders:55`, `send-lead-reminders:58`, and `send-recurring-reminders:56` all authorize with `token === supabaseServiceKey || token === supabaseAnonKey`. The anon key ships in the web bundle, so anyone can invoke these endpoints. Unlike the old `send-email` relay, **recipients are resolved server-side from DB queries** (e.g. `tradie.email` fetched from `profiles`, not caller-supplied), so this is **not** an arbitrary-recipient relay — the risk is unauthorized *triggering* of reminder/SMS batches: duplicate/spam notifications to real users, wasted Resend/Twilio spend, and mild DoS. Severity reduced to MEDIUM accordingly. **Remediation:** gate these on the service-role key (or a dedicated cron shared secret) only; drop anon-key acceptance.
2. **Carried advisor items (not re-verified — no DB session):** public storage bucket listing (advisor lint 0025); `SECURITY DEFINER` functions callable by `anon`/`authenticated`. See 2026-07-01/02 reports. Re-run live `get_advisors` to confirm.

## LOW

1. **`innerHTML` in offscreen PDF builders (unchanged).** `src/components/InvoiceViewModal.tsx:172` and `src/pages/Payouts.tsx:595` assign `innerHTML` on detached, offscreen containers for html2pdf rasterization. `Payouts.tsx` validates/escapes the template `src`; `InvoiceViewModal.tsx` copies already-React-escaped DOM. Low residual risk; both paths depend on the vulnerable `jspdf`/`dompurify` — resolving HIGH #1 also reduces this surface.
2. **`send-email` rate limit is still per-recipient (`:559–561`, 20/min).** With the relay closed (raw `to` now requires an owned contact and `recipientUserId` is server-resolved), the rotate-recipients bypass noted in prior reports is largely moot. Minor: consider rate-limiting per authenticated caller as defence-in-depth. Informational.

---

*Read-only scan. No code was modified or committed.*
