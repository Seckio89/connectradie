# Security Scan — ConnecTradie — 2026-07-06

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `1166922` (Merge PR #59 — hide native Google until configured).
**Git pull:** could not run — no git credentials in the automated environment. Local checkout is at yesterday's merge (2026-07-05), 3 PRs (#57–#59) ahead of the last scan's commit `a93825b`.
**Notification status:** **2 HIGH findings, both carried over unchanged** (third consecutive run for the `send-email` relay, fourth for the dependency set). Push notification warranted per task rules, but no push/notify tool is available in this automated run — flagging here for follow-up.

## Summary

Quiet run. Only 3 PRs merged since the last scan (a nav rename and native Google Sign-In for the Capacitor app); the new code is clean. Both HIGH findings remain open and untouched: the `send-email` authenticated open relay and the 6 production dependency vulnerabilities (incl. critical `jspdf`). No new secrets, no new unsafe DOM sinks, no SQL injection, no new migrations (RLS coverage unchanged). The three MEDIUMs raised on 2026-07-05 also carry over — no related code changed.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | 6 (all carried) |
| LOW      | 4 (3 carried + 1 new note) |

## Changes since last run (2026-07-05)

- **PRs #57–#59 reviewed** (`src/lib/nativeGoogleAuth.ts` new, `Login.tsx`, `Register.tsx`, `DashboardLayout.tsx`, `Schedule.tsx`, Capacitor/Android config, `package.json`/lockfile):
  - `nativeGoogleAuth.ts` embeds a Google **Web OAuth client ID** in source, `capacitor.config.ts`, and `strings.xml`. This is a *public* identifier by design (OAuth client IDs are not secrets), correctly used as `serverClientId` for the ID-token flow; the token is handed straight to `supabase.auth.signInWithIdToken` and never stored. **Not a finding.**
  - No new secrets, no token persistence, no new `localStorage` auth usage, no new DOM sinks in the diff.
- **UNCHANGED HIGH — `send-email` open relay.** Anon-key trust still present (`isAnonKey = token === supabaseAnonKey`, index.ts:399; skip-validation branch at :403). Spoofable `to` fallback unchanged. Same pattern remains in the four reminder/cron functions. Third consecutive run flagged; no fix merged.
- **UNCHANGED HIGH — production dependency vulnerabilities.** `npm audit --omit=dev`: identical 6 findings (1 critical, 1 high, 4 moderate — see HIGH #2). Lockfile dep versions for these packages unchanged.
- **No new migrations** since `20260705120000` — the 2026-07-05 MEDIUMs (#1 `business_team_members` self-insert, #2 `public_vacancies` SECURITY DEFINER view, #3 unvalidated `assigned_team_member_id`) and the LOW trigger-RPC exposure carry over verbatim; see that report for full analysis and fixes.

---

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02)

`supabase/functions/send-email/index.ts` — verified unchanged this run. The public anon key (shipped in the browser bundle) is accepted as an internal principal and skips user validation; caller-supplied `to`, `subject`, `body`, and CTA link are used verbatim; rate limit is per-recipient so rotating recipients bypasses it. Anyone with the frontend bundle can send phishing from `notifications@connectradie.com` (DKIM-aligned via Resend).

**Remediation (unchanged):** use service-role/shared secret for cron instead of the anon key; make `recipientUserId` mandatory and drop the `to` fallback; restrict `metadata.link` to app origins; rate-limit per caller; remove the anon-key trust from `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

## HIGH #2 — Vulnerable production dependencies (6: 1 critical, 1 high, 4 moderate) — carried

`npm audit --omit=dev`, unchanged since 2026-06-13:

| Package | Severity | Issue | Reaches |
|---------|----------|-------|---------|
| `jspdf` | **Critical** | PDF object injection; HTML injection | via `html2pdf.js` — invoice/receipt PDFs |
| `ws` | **High** | Uninitialized memory disclosure; DoS | via `@supabase/supabase-js` realtime |
| `dompurify` | Moderate | Sanitizer bypasses | the PDF path's sanitizer |
| `react-router` / `react-router-dom` | Moderate | Open redirect via `//` path | app routing |
| `tar` | Moderate | PAX header file smuggling | build-time (`@capacitor/cli`) |

Fixes are available for all (`npm audit` reports `fixAvailable: true`); `html2pdf.js` pins old `jspdf`/`dompurify`, so a `package.json` `overrides` block is likely needed. Fourth run with no version movement — recommend adding `npm audit --omit=dev --audit-level=high` to CI.

**Dev-only (not counted above):** full `npm audit` shows 18 findings including critical `vitest` (UI-server file read — local dev only) and high `vite`/`undici`/`picomatch`/`flatted`. Low urgency; a routine `npm audit fix` in a maintenance window would clear most.

## MEDIUM (all carried from 2026-07-05 — no related code changed)

1. `business_team_members` self-insert policy under-constrained (`20260705110000`) — any authenticated user can insert themselves `status='active'` into any business's roster. Fix: tighten `WITH CHECK` to require a pending/request status.
2. `public_vacancies` SECURITY DEFINER view (`20260704140000`) — live advisor ERROR-level lint.
3. `recurring_jobs.assigned_team_member_id` not validated against the owner's business.
4. `innerHTML` PDF-generation paths in `InvoiceViewModal.tsx:172` and `Payouts.tsx:594` — template-built HTML interpolating DB-sourced values into `html2pdf.js` (which uses the vulnerable `jspdf`/`dompurify` above). Compounding risk with HIGH #2.

*(Items 1–3 counted with the carried MEDIUM total of 6 alongside the three pre-2026-07-05 carried items — see prior reports.)*

## LOW

1. (Carried) SECURITY DEFINER trigger functions (`notify_matching_tradies_new_vacancy`, `notify_service_assignment`) executable via PostgREST RPC — revoke `EXECUTE` to silence.
2. (Carried) Prior LOW items per 2026-07-05 report.
3. **New note:** local `.env` contains real Stripe **test-mode** keys (`sk_test_…`, `whsec_…`). Correctly gitignored, never committed (verified against full history) — no exposure. Noted only so a future move to live keys keeps the same hygiene.

## Verified clean this run

- No secrets in tracked files: no `sk_live_`/`sk_test_`/`whsec_` outside gitignored `.env`; no JWTs in tracked source; no `SERVICE_ROLE` references in `src/`; `.env.example` placeholder-only; `.env` never in git history.
- No `eval()`, no `dangerouslySetInnerHTML`; only the two known `innerHTML` PDF paths.
- No raw-SQL string interpolation in the 20+ edge functions.
- No auth tokens in `localStorage` (only UI flags/dedupe keys; Supabase client manages its own session).
- RLS: every migration creating tables also enables RLS (47/47 migration files); no new tables since last scan.
