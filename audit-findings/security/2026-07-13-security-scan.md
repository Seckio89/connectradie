# Security Scan — ConnecTradie — 2026-07-13

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `788de69` (docs: mark signed AAB built in checklist). Working tree scanned as-is.
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree, which is 15 commits ahead of the last scan's `69256f0`.
**Notification status:** **1 HIGH finding present** (vulnerable production dependencies, incl. 1 CRITICAL). Push warranted per task rules, but no push/notify tool is available in this automated run — flagged here for follow-up.

## Summary

No exposed credentials, no `.env` leakage, no hardcoded Stripe/Supabase secrets, no JWTs in source, no `eval`, no `dangerouslySetInnerHTML`, no SQL injection, and no `.env` in git history. RLS coverage remains complete: 72 distinct tables created across local migrations, all 72 with `ENABLE ROW LEVEL SECURITY` (492 policies) — zero tables without RLS. The Stripe webhook validates signatures (`constructEventAsync`). Edge functions read the service-role key from env only.

Security posture is **unchanged** since 2026-07-12. The one HIGH (vulnerable prod dependency set) and one MEDIUM (cron/reminder endpoints accepting the public anon key) are both carried and unremediated. The 15 commits since the last scan are Android release plumbing, docs/checklists, and minor payouts UI fixes — no security regressions, plus one small positive (Google OAuth scope narrowed to `calendar.events`).

| Severity | Count | Change since 2026-07-12 |
|----------|-------|--------------------------|
| CRITICAL | 0 standalone (1 CRITICAL CVE inside the HIGH dep finding) | — |
| HIGH     | 1 (vulnerable deps, carried) | unchanged |
| MEDIUM   | 1 (cron anon-key trust, carried) | unchanged |
| LOW      | 2 (offscreen `innerHTML`; long-lived geofence token in `localStorage`) | unchanged |

## Changes since last run (2026-07-12)

- **No new secrets, no RLS gaps, no new injection surfaces.**
- **HIGH (deps) unchanged** — `npm audit --omit=dev` still reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate**. Identical set to prior runs. No `npm audit fix` has been run. (Full-tree audit incl. dev deps: 18 total — 2 critical, 5 high, 9 moderate, 2 low.)
- **MEDIUM (cron anon-key) unchanged** — `generate-recurring-sessions:87`, `send-invoice-reminders:55`, `send-lead-reminders:58`, `send-recurring-reminders:56` all still authorize with `token === supabaseServiceKey || token === supabaseAnonKey`.
- **Positive** — commit `808137e` narrows the Google Calendar OAuth scope to `calendar.events` (least privilege). Commit `8e512ac` wires Android release signing from a git-ignored `keystore.properties` (keystore correctly kept out of the repo).

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `e2e/`, and root config (excluded `node_modules`, `dist`, the `connectradie.tar.gz`/`.zip` archives, and `package-lock`). Patterns: `sk_live_`/`sk_test_`, `whsec_`, `rk_`, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE` in client code, and `password`/`secret`/`api_key`/`token` literal assignments.
- `.gitignore`, git tracking, and git history checked for `.env` (clean — only `.env.example` is tracked, all placeholder values).
- Local migrations analysed for RLS coverage (`CREATE TABLE` vs `ENABLE ROW LEVEL SECURITY`).
- Edge functions reviewed for auth model, webhook signature validation, and SQL-injection risk.
- `npm audit` (full + `--omit=dev`) run against the committed lockfile (no network install).
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); git pull (no credentials).

---

## CRITICAL — none standalone

(One CRITICAL-rated CVE, `jspdf`, is a component of HIGH #1 below.)

## HIGH #1 — Vulnerable production dependencies (carried, unchanged)

`npm audit --omit=dev` reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate. All have fixes available.**

| Package | Severity | Path / usage | Issue |
|---------|----------|--------------|-------|
| `jspdf` (via `html2pdf.js@^0.14.0`) | **Critical** | invoice / receipt / payout PDF generation | PDF object injection via FreeText color; HTML injection in new-window paths |
| `ws` (via `@supabase/supabase-js@^2.57.4` realtime) | **High** | realtime socket | Uninitialized memory disclosure; memory-exhaustion DoS from tiny fragments |
| `dompurify` (via html2pdf/jspdf chain) | Moderate | PDF sanitization | Multiple sanitizer/FORBID_TAGS bypasses; prototype-pollution to XSS |
| `react-router` / `react-router-dom` (`6.6.3–6.30.3`) | Moderate | client routing | Open redirect via protocol-relative `//` URL reinterpretation |
| `tar` | Moderate | build/packaging | Parser interpretation differential (file smuggling) |

**Remediation (unchanged):** run `npm audit fix`, redeploy, re-audit. Prioritise `jspdf` and `ws` — both sit on live user-facing paths (PDF export and realtime). Bump `react-router-dom` to close the open-redirect. Wire `npm audit --omit=dev` into CI to catch regressions.

## MEDIUM #1 — Cron/reminder edge functions accept the public anon key (carried, unchanged)

`generate-recurring-sessions:87`, `send-invoice-reminders:55`, `send-lead-reminders:58`, and `send-recurring-reminders:56` authorize with `token === supabaseServiceKey || token === supabaseAnonKey`. The anon key ships in the web bundle, so anyone can invoke these endpoints. Recipients are resolved **server-side** from DB queries (not caller-supplied), so this is **not** an arbitrary-recipient relay — the risk is unauthorized *triggering* of reminder/SMS batches: duplicate/spam notifications to real users, wasted Resend/Twilio spend, and mild DoS.

**Remediation:** gate these on the service-role key (or a dedicated cron shared secret) only; drop anon-key acceptance.

## LOW

1. **`innerHTML` in offscreen PDF builders (unchanged).** `src/components/InvoiceViewModal.tsx:172` and `src/pages/Payouts.tsx:595` assign `innerHTML` on detached, offscreen containers for html2pdf rasterization. `Payouts.tsx` validates/escapes the template `src`; `InvoiceViewModal.tsx` copies already-React-escaped DOM. Low residual risk; both paths depend on the vulnerable `jspdf`/`dompurify`, so resolving HIGH #1 also reduces this surface. `LicenseCertificate.tsx:310` follows the same offscreen-print pattern.
2. **Long-lived device geofence token in `localStorage` (unchanged).** `src/lib/siteGeofence.ts` mints an opaque, non-expiring device token (`ensureDeviceToken`, stored under `TOKEN_CACHE_KEY`) that authenticates background POSTs to the geofence edge function "long after any JWT would have expired," backed by the RLS-protected `device_geofence_tokens` table. A persistent bearer credential in `localStorage` is readable by any XSS on the origin. Acceptable trade-off for background geolocation, but consider rotation/expiry and binding the token to device attributes. (Supabase's own session token in `localStorage` is framework-default and out of scope.)

---

*Automated read-only scan. No code was committed or modified. Prior report: `audit-findings/security/2026-07-12-security-scan.md`.*
