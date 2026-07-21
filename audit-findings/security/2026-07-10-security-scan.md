# Security Scan — ConnecTradie — 2026-07-10

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `41a3ab8` (fix(payouts): include GST in one-off destination payouts). **Working tree:** dirty — ~14+ uncommitted paths (Android build files, scripts, `src/App.tsx`, `public/service-worker.js`, prior scan report).
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree.
**Notification status:** **2 HIGH findings present, both carried and unchanged.** Push warranted per task rules, but no push/notify tool is available in this automated run — flagged here for follow-up.

## Summary

No exposed credentials, no `.env` leakage, no SQL injection, and RLS coverage is complete (73 `CREATE TABLE` / 73 `ENABLE ROW LEVEL SECURITY` across local migrations; every table has RLS enabled). The two open HIGH findings — the `send-email` anon-key relay and the vulnerable production dependency set — are both present and unchanged since 2026-07-08/09. No new CRITICAL/HIGH introduced.

One correction to prior reports this run: the `google-calendar-oauth` callback does **not** implement a real CSRF nonce. Every scan since 07-01 described it as "does its own CSRF validation" — inspection shows the `state` parameter is just the raw Supabase user ID, trusted verbatim on callback. Reclassified as a MEDIUM account-linking / CSRF weakness (details below).

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | 1 new (OAuth state) + carried advisor/dep items |
| LOW      | 2 |

## Changes since last run (2026-07-09)

- **HIGH #1 unchanged** — `send-email` anon-key trust still present verbatim (`supabaseAnonKey` at :391, `isAnonKey` at :399, bypass branch at :403).
- **HIGH #2 unchanged** — prod dependency vulns identical to 07-09 (6 prod: 1 critical, 1 high, 4 moderate; all have fixes available).
- **RLS coverage grew** — 72 → 73 tables, still 1:1 with `ENABLE ROW LEVEL SECURITY`. No table without RLS.
- **NEW/CORRECTED MEDIUM** — `google-calendar-oauth` OAuth `state` is the raw user ID, not a random session-bound nonce; the callback trusts it verbatim (`user = { id: state }`, "No separate check needed" comment at the callback). Prior reports mislabeled this endpoint as CSRF-validated. See MEDIUM #1.
- **Print/export XSS hardening remains in place** — `escapeHtml` still applied across `Payouts.tsx`, `Leads.tsx`, `PaymentHistory.tsx`, `InvoiceViewModal.tsx`, `LicenseCertificate.tsx`. No regression.

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `index.html`, and `android/` assets (excluded `node_modules`, archives, lockfile). Patterns: `sk_live_`/`sk_test_`, `whsec_`, `rk_live_`/`rk_test_`, `AIza…` (Google), `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`, `BEGIN … PRIVATE KEY`, and `password`/`secret`/`api_key`/`token` literal assignments.
- Local migrations analysed for RLS coverage (CREATE TABLE vs ENABLE RLS diff).
- Edge functions reviewed for auth model, `verify_jwt` config, and SQL-injection risk.
- `npm audit --omit=dev` run against the lockfile (no network install).
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); prior advisor MEDIUMs carried, not re-verified. Git pull (no credentials).

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no `whsec_`/`rk_` keys, no Google `AIza…` keys, no credential JWTs, and no private keys in source or the working-tree diff. The only secret-shaped strings are placeholders in `.env.example` and `env(...)` references in `supabase/config.toml`.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders only).
- **Service-role key:** `SUPABASE_SERVICE_ROLE_KEY` appears only server-side in edge functions via `Deno.env.get(...)`. Zero occurrences in client `src/`.
- **Client env vars:** All `VITE_*` vars referenced in `src/` are public-safe (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, Stripe **publishable** key, Google Maps key, Sentry DSN, VAPID **public** key). No secret key exposed to the client.
- **Third-party license JWT:** `android/.../strings.xml` contains a Transistorsoft background-geolocation license token (`transistor_bg_geo_license`). This is a vendor product-license key meant to be embedded in the app binary — not an auth credential. Informational only.
- **Auth bypass:** No unauthenticated privileged routes. `verify_jwt = false` is pinned in `config.toml` only for `stripe-webhook` (Stripe signature verified via `constructEventAsync`) and `google-calendar-oauth` (OAuth redirect path; see MEDIUM #1 re: its weak state handling).

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02, unchanged)

`supabase/functions/send-email/index.ts` — the public anon key (shipped in the browser bundle) is accepted as a trusted internal caller and skips user validation: `SUPABASE_ANON_KEY` read at :391, `isAnonKey = token === supabaseAnonKey` at :399, bypass at `if (!isServiceRole && !isAnonKey)` :403. Caller-supplied `to`/`subject`/`body`/CTA link are used verbatim; rate limiting is per-recipient, so rotating recipients defeats it. Anyone holding the frontend bundle can send mail from the platform's DKIM-aligned sender (phishing / reputation risk). The same anon-key-trust pattern appears in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

**Remediation (unchanged):** replace anon-key trust with a service-role or dedicated shared secret for cron callers; make `recipientUserId` mandatory and drop the raw `to` fallback; restrict `metadata.link` to app origins; rate-limit per authenticated caller, not per recipient.

## HIGH #2 — Vulnerable production dependencies (carried, unchanged)

`npm audit --omit=dev` reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate. All have fixes available.**

| Package | Severity | Reaches | Note |
|---------|----------|---------|------|
| `jspdf` (via `html2pdf.js`) | **Critical** | invoice/receipt/payout PDF generation | PDF object injection via FreeText color; HTML injection in new-window paths |
| `ws` (via `@supabase/supabase-js` realtime) | **High** | realtime socket | Uninitialized memory disclosure; memory-exhaustion DoS from tiny fragments |
| `dompurify` (via `html2pdf.js`) | Moderate | PDF sanitizer | Multiple FORBID_TAGS / IN_PLACE / template bypasses |
| `react-router` / `react-router-dom` | Moderate | routing | Open redirect via protocol-relative `//` URL |
| `tar` (transitive) | Moderate | build/tooling | PAX header parser differential (file smuggling) |

**Remediation (unchanged):** run `npm audit fix` (all fixes are non-breaking per npm), redeploy, and re-audit. Prioritise `jspdf` and `ws` (both on live user-facing paths). Recommend wiring `npm audit --omit=dev` into CI to catch regressions.

## MEDIUM

1. **NEW / CORRECTED — `google-calendar-oauth` lacks a real CSRF state nonce (account-linking risk).** In `supabase/functions/google-calendar-oauth/index.ts`, initiation sets `state = user.id` (the Supabase UUID), and the callback trusts it verbatim: `const user = code && state ? { id: state } : …`, with the comment "State param is the user ID … No separate check needed." Because the OAuth `state` is a static, non-secret user identifier rather than a random per-session nonce stored server-side, the classic OAuth CSRF protection is absent. An attacker who knows a victim's user UUID (these surface across a two-sided marketplace — profiles, chat, job assignments) can initiate their own consent flow, substitute the victim's UUID into `state`, and cause the resulting Google refresh token to be stored under the victim's account — leaking the victim's synced job schedule / site-visit calendar to the attacker, or hijacking which Google calendar the victim's events sync to. `verify_jwt = false` on this endpoint means there is no JWT backstop on the callback. **Remediation:** generate a cryptographically random `state`, persist it server-side bound to the initiating (JWT-authenticated) user with a short TTL, and on callback look up the user from that stored nonce instead of trusting `state` as the identity. *(This corrects prior scans that described this endpoint as performing its own CSRF validation.)*

2. **Carried advisor items (not re-verified this run — no DB session):** public storage buckets allow listing (advisor lint 0025); `SECURITY DEFINER` functions callable by `anon`/`authenticated`. See 2026-07-01/02 reports for the full list. Re-run live advisors (`get_advisors`) to confirm current state.

## LOW

1. **`innerHTML` in offscreen PDF builders.** `src/components/InvoiceViewModal.tsx:172` and `src/pages/Payouts.tsx:595` assign `innerHTML` on detached, offscreen containers for html2pdf rasterization. `Payouts.tsx` validates and HTML-escapes the custom-template `src` (data:image/* or https: only) before interpolation; `InvoiceViewModal.tsx` copies already-React-escaped DOM (`printRef.current.innerHTML`). Low residual risk, but these paths depend on the underlying (vulnerable) `jspdf`/`dompurify` — resolving HIGH #2 also reduces this surface.
2. **Opaque geofence token cached in `localStorage`.** `src/lib/siteGeofence.ts` caches a random UUID device token (stored in the RLS-protected `device_geofence_tokens` table) to authenticate background geolocation POSTs after JWT expiry. Reasonable for native background geofencing; noted for completeness. Not a credential leak.

---

*Read-only scan. No code was modified or committed.*
