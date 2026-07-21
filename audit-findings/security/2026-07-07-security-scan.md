# Security Scan — ConnecTradie — 2026-07-07

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `bd05de7` (Merge PR #67 — geofence init race fix).
**Git pull:** could not run — no git credentials in the automated environment. Local checkout is current to 2026-07-07 19:37 (+1000), 8 PRs (#60–#67) ahead of the last scan's `1166922`.
**Notification status:** **2 HIGH findings, both carried over unchanged** (4th consecutive run for the `send-email` relay; 5th run for the dependency set). Push notification warranted per task rules, but no push/notify tool is available in this automated run — flagging here for follow-up.

## Summary

Quiet, clean run. The 8 PRs merged since the last scan are the native **site geofencing** feature (Capacitor background geolocation) plus Google Sign-In debug clean-up. The new code is well-built: 3 new migrations all ship RLS, and the new `geofence-event` edge function uses a properly validated custom device-token auth pattern (see note below — not a finding). No new secrets, no new unsafe DOM sinks, no SQL injection, RLS coverage remains complete (all 72 created tables have `ENABLE ROW LEVEL SECURITY`). Both HIGH findings remain open and untouched. Prior MEDIUMs carry over — no related code changed.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | 6 (all carried) |
| LOW      | 4 (3 carried + 1 new note) |

## Changes since last run (2026-07-06)

- **PRs #60–#67 reviewed** — native background site geofencing and Google auth debug reverts.
  - New files: `src/hooks/useSiteGeofencing.ts`, `src/lib/siteGeofence.ts`, `src/lib/notifications.ts` changes, `supabase/functions/geofence-event/index.ts`, plus geo columns/coords capture across `Leads.tsx`, `PostLead.tsx`, `Onboarding.tsx`, `Settings.tsx`, `ProfileTab.tsx`.
  - **3 new migrations** (`20260706100000` geo columns, `20260706101000` geo-scoped new-job notifications, `20260706102000` site geofence tables). The two new tables — `device_geofence_tokens` and `site_visit_events` — both `ENABLE ROW LEVEL SECURITY` with owner-scoped policies (`tradie_id = auth.uid()`; clients read events for their own jobs). Inserts are service-role-only via the edge function, intentionally with no INSERT policy. **Clean.**
  - No new secrets, no token persistence in `localStorage`, no new DOM sinks in the diff.
- **UNCHANGED HIGH — `send-email` open relay.** Anon-key trust still present (`isAnonKey = token === supabaseAnonKey`, index.ts:399; skip-validation branch at :403). Verified unchanged this run.
- **UNCHANGED HIGH — production dependency vulnerabilities.** `npm audit --omit=dev`: identical 6 findings (1 critical, 1 high, 4 moderate). No lockfile version movement.

---

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02)

`supabase/functions/send-email/index.ts` — verified unchanged. The public anon key (shipped in the browser bundle) is accepted as an internal principal and skips user validation (`isAnonKey` at :399, bypass at :403); caller-supplied `to`, `subject`, `body`, and CTA link are used verbatim; rate limit is per-recipient so rotating recipients bypasses it. Anyone with the frontend bundle can send phishing from `notifications@connectradie.com` (DKIM-aligned via Resend).

**Remediation (unchanged):** use a service-role/shared secret for cron instead of the anon key; make `recipientUserId` mandatory and drop the `to` fallback; restrict `metadata.link` to app origins; rate-limit per caller; remove the anon-key trust from `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

## HIGH #2 — Vulnerable production dependencies (6: 1 critical, 1 high, 4 moderate) — carried

`npm audit --omit=dev` this run — unchanged since 2026-06-13:

| Package | Severity | Reaches | fixAvailable |
|---------|----------|---------|--------------|
| `jspdf` | **Critical** | via `html2pdf.js` — invoice/receipt PDFs | yes |
| `ws` | **High** | via `@supabase/supabase-js` realtime | yes |
| `dompurify` | Moderate | the PDF path's sanitizer | yes |
| `react-router` / `react-router-dom` | Moderate | app routing (open redirect via `//`) | yes |
| `tar` | Moderate | build-time (`@capacitor/cli`) | yes |

All report `fixAvailable: true`. `html2pdf.js` pins old `jspdf`/`dompurify`, so a `package.json` `overrides` block is likely needed to force patched versions. 5th run with no version movement — recommend adding `npm audit --omit=dev --audit-level=high` to CI.

**Dev-only (not counted above):** full `npm audit` shows 18 findings (2 critical, 5 high, 9 moderate, 2 low) including `vitest`/`vite`/`undici` — local dev only, low urgency; a routine `npm audit fix` in a maintenance window would clear most.

## MEDIUM (all carried — no related code changed this run)

1. `business_team_members` self-insert policy under-constrained (`20260705110000`) — any authenticated user can insert themselves `status='active'` into any business's roster. Fix: tighten `WITH CHECK` to require a pending/request status.
2. `public_vacancies` SECURITY DEFINER view (`20260704140000`) — live advisor ERROR-level lint.
3. `recurring_jobs.assigned_team_member_id` not validated against the owner's business.
4. `innerHTML` PDF-generation paths in `InvoiceViewModal.tsx:172` and `Payouts.tsx:594` — template-built HTML fed to `html2pdf.js` (which uses the vulnerable `jspdf`/`dompurify` in HIGH #2). Note: `Payouts.tsx` does escape the invoice number via `escapeHtml` (:478); risk is the compounding dependency exposure, not a raw unescaped sink. Verify all DB-sourced fields in both templates are escaped.

*(Counted as the carried MEDIUM total of 6 alongside two pre-2026-07-05 carried items — see prior reports.)*

## LOW

1. **(New, informational)** `supabase/functions/geofence-event/index.ts` is intentionally deployed **without JWT verification** (background geolocation events can fire when no user session is available). Auth is a custom per-device opaque token (`X-Geofence-Token`) looked up in `device_geofence_tokens`; missing/invalid tokens are rejected with 401 before any service-role write, and `tradie_id` is derived server-side from the token row (never trusted from the request body). This is a sound pattern — flagged only so the no-JWT function is tracked. Recommend: ensure device tokens are high-entropy and revocable, and consider a per-token rate limit on this public endpoint.
2. Local `.env` contains a `sk_test_…` Stripe **test** key. It is correctly gitignored (`.gitignore` line: `.env`) and **not tracked** in git (`git ls-files` shows only `.env.example`, which holds placeholders only). Not committed → not a finding, noted for completeness.
3–4. Carried LOW items from prior reports (trigger-RPC exposure, etc.) — unchanged.

---

## Checks performed this run

- Secrets: `sk_live_`/`sk_test_`, `eyJ…` JWTs, `SERVICE_ROLE`/`service_role` in client code, hardcoded `password`/`secret`/`api_key` assignments — none in committed source (only local gitignored `.env`).
- Git hygiene: `.gitignore` covers `.env`; `.env.example` placeholders only; no `.env` tracked or in visible history.
- DOM sinks: `dangerouslySetInnerHTML` (none), `innerHTML` (2 known PDF paths — MEDIUM #4), `eval` (none in src).
- SQL injection: no raw SQL string interpolation — all edge-function `${...}` matches are notification/message text via the Supabase query builder.
- RLS: every `CREATE TABLE` (72) has a matching `ENABLE ROW LEVEL SECURITY`; new geo tables confirmed policy-scoped.
- Webhook: `stripe-webhook` validates signatures via `constructEventAsync` with `STRIPE_WEBHOOK_SECRET` (correct).
- Dependencies: `npm audit` prod + full.
