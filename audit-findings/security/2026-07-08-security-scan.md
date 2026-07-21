# Security Scan — ConnecTradie — 2026-07-08

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master`. **Working tree:** dirty — 105 uncommitted paths (see "Changes since last run").
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree.
**Notification status:** **2 HIGH findings carried, both unchanged.** Push warranted per task rules, but no push/notify tool is available in this automated run — flagging here for follow-up.

## Summary

Clean-to-neutral run. No exposed credentials, no authentication bypass, no SQL injection, and RLS coverage remains complete (73 `CREATE TABLE` / 73 `ENABLE ROW LEVEL SECURITY` / 488 `CREATE POLICY` in local migrations). The two open HIGH findings — the `send-email` anon-key relay and the vulnerable production dependency set — are both present and unchanged.

The notable delta since 2026-07-07 is a large dirty working tree, including one **new edge function, `public-quote`** (a token-gated, unauthenticated, service-role endpoint for off-app clients). It is reasonably well-built but introduces an unauthenticated state mutation; details in MEDIUM #1. Also new: a third-party background-geolocation **license token** now committed in `android/.../strings.xml` — expected to ship client-side, not a credential leak (LOW #1).

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | 1 new + carried advisor items (not re-verified this run) |
| LOW      | 2 new + carried |

## Changes since last run (2026-07-07)

- **Working tree is heavily modified** — 105 uncommitted paths: `src/components` (23), `src/pages` (19), `supabase/migrations` (16), `src/lib` (10), plus 5 edge functions and Android/Capacitor build files. This is uncommitted local work sitting on top of `master`; it is not yet on the remote and was not code-reviewed via PR.
- **NEW — `public-quote` edge function** (`supabase/functions/public-quote/index.ts`, untracked). Unauthenticated, token-gated public quote viewer/acceptor for off-app clients. See MEDIUM #1.
- **`send-email` shows a whole-file diff** — this is line-ending (LF/CRLF) normalization, **not** a behavioral change. The anon-key trust logic is byte-for-byte unchanged (`isAnonKey = token === supabaseAnonKey` at :399; bypass at :403). HIGH #1 still applies.
- **Other edge-function edits in the tree** (`geofence-event`, `send-invoice-approval-nudge`, `stripe-connect-account`, `stripe-payout-settings`) — no new secrets, no new unsafe DOM sinks, auth checks intact.
- **NEW — Transistorsoft bg-geolocation license token** added to `android/app/src/main/res/values/strings.xml`. See LOW #1 (informational — client-side product license, not a secret).
- **Print/export XSS hardening remains in place** — `escapeHtml` is still applied across `Payouts.tsx`, `Leads.tsx`, `PaymentHistory.tsx`, `InvoiceViewModal.tsx`, `LicenseCertificate.tsx`. No regression in the previously-remediated sinks.

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `index.html` (excluded `node_modules`, `dist`, archives, lockfile). Patterns: `sk_live_`/`sk_test_`, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`, and `password`/`secret`/`api_key`/`token` assignments with literal values.
- `git diff` reviewed for any secret-shaped additions.
- Local migrations analysed for RLS coverage; edge functions reviewed for auth model and SQL-injection risk.
- `npm audit` and `npm audit --omit=dev` run against the lockfile (no network install).
- **Not performed this run:** live Supabase security-advisor query (no DB session established in this unattended run). Prior advisor-level MEDIUMs are carried forward but *not re-verified* — see "Carried items".

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no credential JWTs, no private keys in source or in the working-tree diff.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders only).
- **Service-role key:** `SUPABASE_SERVICE_ROLE_KEY` appears only server-side in edge functions via `Deno.env.get(...)`. Zero occurrences in client `src/`.
- **Auth bypass:** No new unauthenticated privileged routes. `verify_jwt = false` is pinned in `config.toml` only for `stripe-webhook` and `google-calendar-oauth` (both do their own signature/CSRF validation).

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02, unchanged)

`supabase/functions/send-email/index.ts` — the public anon key (shipped in the browser bundle) is accepted as a trusted internal caller and skips user validation (`isAnonKey` at :399, bypass branch at :403). Caller-supplied `to`/`subject`/`body`/CTA link are used verbatim; the rate limit is per-recipient, so rotating recipients defeats it. Anyone with the frontend bundle can send mail from the platform's DKIM-aligned sender. The same anon-key trust is present in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, and `send-recurring-reminders`.

**Remediation (unchanged):** replace anon-key trust with a service-role/shared secret for cron callers; make `recipientUserId` mandatory and drop the `to` fallback; restrict `metadata.link` to app origins; rate-limit per caller.

## HIGH #2 — Vulnerable production dependencies (carried, unchanged)

`npm audit --omit=dev` reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate.** All have fixes available.

| Package | Severity | Reaches | Fix |
|---------|----------|---------|-----|
| `jspdf` (via `html2pdf.js`) | Critical | invoice/receipt PDF generation | `npm audit fix` |
| `ws` (via `@supabase/supabase-js` realtime) | High | uninitialized memory disclosure / DoS | available |
| `dompurify` | Moderate | PDF path sanitizer (multiple bypass CVEs) | available |
| `react-router` / `react-router-dom` | Moderate | open redirect via protocol-relative `//` | available |
| `tar` | Moderate | file-smuggling parser differential | available |

(Full dev+prod audit: 18 vulnerabilities — 2 critical, 5 high, 9 moderate, 2 low.) **Remediation:** run `npm audit fix`, then re-run the type-check and build to confirm no breakage before committing the lockfile.

## MEDIUM #1 — NEW — `public-quote`: unauthenticated state mutation, no rate limit

`supabase/functions/public-quote/index.ts` (untracked, ~130 lines). Token-gated public endpoint intended to deploy with `--no-verify-jwt`. It validates the `token` is a well-formed UUID, looks up the quote by `quotes.public_token` using the **service-role** client, and returns only client-safe fields (no internal IDs / CRM PII) — all good.

The concern: the `action:"accept"` path performs **unauthenticated writes** — it flips `quotes.status` to `accepted` and updates `jobs.status`→`accepted` and `jobs.tradie_id`, then inserts a notification. Possession of the `public_token` alone is sufficient to accept a quote and reassign the job's tradie, and there is **no rate limiting** on the endpoint. This is largely by design (the off-app client authenticates by holding the unguessable emailed link), and a 122-bit random UUID makes enumeration infeasible, so the residual risk is low — but the token is long-lived and grants a financially-consequential state change with no throttle or expiry check.

**Recommendation:** add per-token/per-IP rate limiting; consider a token expiry or single-use-on-accept semantics; confirm `public_token` is generated with a CSPRNG (`gen_random_uuid()` / `crypto.randomUUID()`) and is not logged. Also see LOW #2 re: config pinning.

## Carried MEDIUM items (advisor-level — NOT re-verified this run)

From prior runs; carried forward because no related code changed, but the live Supabase advisor was not queried in this unattended run. Re-verify when a DB session is available:

1. **Public storage buckets allow listing** (advisor lint 0025, 5 buckets). Remediation migration exists; confirm it has been applied to prod.
2. **`SECURITY DEFINER` functions callable by `anon`/`authenticated`** (advisor). Review the exposed function list and lock down where possible.

## LOW

1. **NEW (informational) — Transistorsoft bg-geolocation license token in `android/.../strings.xml`.** The `transistor_bg_geo_license` value is a signed product-license token that decodes to order/product metadata (app id, order number, allowed suffixes). It is **designed to be embedded in the shipped Android app** and does not grant access to ConnecTradie systems — not a credential leak. No action required; noted for completeness so future scans don't re-flag the `eyJ…` string.
2. **NEW — `public-quote` not pinned in `config.toml`.** The function relies on a manual `--no-verify-jwt` deploy flag (per its header comment) rather than a `[functions.public-quote] verify_jwt = false` entry alongside `stripe-webhook` and `google-calendar-oauth`. This risks deployment drift (a plain `supabase functions deploy` could re-enable JWT verification and break the off-app flow, or config differences between environments). Pin it explicitly.
3. **`localStorage` token cache** in `src/lib/siteGeofence.ts` — an opaque device geofence token is cached in `localStorage`. This is an intentional design for background POSTs that outlive a JWT, and the token is device/tradie-scoped and server-revocable; acceptable, noted only for tracking.

---

### Verification notes

- Secret patterns, RLS counts, dependency audit, and the `public-quote` / `send-email` code paths were each confirmed directly against the working tree this run (not carried assertions).
- The only `eyJ…` hit in the codebase/diff is the Android license token (LOW #1); no JWT credentials found in source or built output paths scanned.
- Because git pull was unavailable, findings reflect the **local working tree**, which is currently ahead of / divergent from committed `master` by 105 uncommitted paths.
