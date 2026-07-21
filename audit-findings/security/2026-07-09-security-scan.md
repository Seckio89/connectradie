# Security Scan — ConnecTradie — 2026-07-09

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `5a5ceec` (Merge PR #76 — estimate-quote adaptive thinking budget). **Working tree:** dirty — 114 uncommitted paths.
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree.
**Notification status:** **2 HIGH findings carried, both unchanged.** Push warranted per task rules, but no push/notify tool is available in this automated run — flagging here for follow-up.

## Summary

Clean-to-neutral run. No exposed credentials, no authentication bypass, no SQL injection, and RLS coverage remains complete (72 `CREATE TABLE` / 72 `ENABLE ROW LEVEL SECURITY` / 490 `CREATE POLICY` in local migrations). The two open HIGH findings — the `send-email` anon-key relay and the vulnerable production dependency set — are both present and unchanged since 2026-07-08. No new HIGH/CRITICAL introduced.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 (in first-party code) |
| HIGH     | 2 (both carried, unchanged) |
| MEDIUM   | carried advisor/dep items |
| LOW      | 2 |

## Changes since last run (2026-07-08)

- **Working tree still heavily modified** — 114 uncommitted paths (was 105 on 07-08). Same modified edge functions carried (`estimate-quote`, `geofence-event`, `public-quote`, `send-email`, `send-invoice-approval-nudge`, `stripe-connect-account`, `stripe-payout-settings`). All local, not on remote, not PR-reviewed.
- **HIGH #1 unchanged** — `send-email` anon-key trust still present verbatim (`isAnonKey = token === supabaseAnonKey` at :399; bypass at :403).
- **HIGH #2 unchanged** — prod dependency vulns identical to 07-08 (6 prod: 1 critical, 1 high, 4 moderate).
- **CREATE POLICY count 488 → 490** (+2), consistent with minor migration work. RLS coverage still complete; no table without RLS.
- **Print/export XSS hardening remains in place** — `escapeHtml` still applied across `Payouts.tsx`, `Leads.tsx`, `PaymentHistory.tsx`, `InvoiceViewModal.tsx`, `LicenseCertificate.tsx`. No regression.

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `index.html`, built `dist/` and `android/` assets (excluded `node_modules`, archives, lockfile). Patterns: `sk_live_`/`sk_test_`, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`, `password`/`secret`/`api_key`/`token` literal assignments.
- Local migrations analysed for RLS coverage (CREATE TABLE vs ENABLE RLS vs CREATE POLICY diff).
- Edge functions reviewed for auth model and SQL-injection risk.
- `npm audit` (full) and `npm audit --omit=dev` run against the lockfile (no network install).
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); prior advisor MEDIUMs carried, not re-verified.

---

## CRITICAL — none (first-party)

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no credential JWTs, no private keys in source or working-tree diff.
- **`.env` handling:** `.env` is gitignored, not tracked, absent from git history. Only `.env.example` committed (placeholders only).
- **Service-role key:** `SUPABASE_SERVICE_ROLE_KEY` appears only server-side in edge functions via `Deno.env.get(...)`. Zero occurrences in client `src/`.
- **Client bundle check:** The only JWTs baked into `dist/` and Android assets are the Supabase **anon** key (`"role":"anon"`, 12 occurrences) — designed to be public, protected by RLS. The `service_role` string in `.js.map` is supabase-js library warning text ("Never expose your service_role key in the browser"), not a key. Android `app/build/` and `dist/` are NOT git-tracked.
- **Auth bypass:** No new unauthenticated privileged routes. `verify_jwt = false` pinned only for `stripe-webhook` and `google-calendar-oauth` (both do own signature/CSRF validation).

## HIGH #1 — `send-email` is an authenticated open email relay (carried from 2026-07-02, unchanged)

`supabase/functions/send-email/index.ts` — the public anon key (shipped in the browser bundle) is accepted as a trusted internal caller and skips user validation (`supabaseAnonKey` at :391, `isAnonKey` at :399, bypass branch at :403). Caller-supplied `to`/`subject`/`body`/CTA link used verbatim; rate limit is per-recipient, so rotating recipients defeats it. Anyone with the frontend bundle can send mail from the platform's DKIM-aligned sender. Same anon-key trust pattern in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

**Remediation (unchanged):** replace anon-key trust with a service-role/shared secret for cron callers; make `recipientUserId` mandatory and drop the `to` fallback; restrict `metadata.link` to app origins; rate-limit per caller.

## HIGH #2 — Vulnerable production dependencies (carried, unchanged)

`npm audit --omit=dev` reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate.** All have fixes available.

| Package | Severity | Reaches | Fix |
|---------|----------|---------|-----|
| `jspdf` (via `html2pdf.js`) | Critical/High (PDF object injection, GHSA-7x6v-j9x4-qf24) | invoice/receipt/payout PDF generation | `npm audit fix` |
| `ws` (via `@supabase/supabase-js` realtime) | High (uninitialized memory disclosure, GHSA-58qx-3vcg-4xpx) | realtime socket | available |
| `dompurify` | Moderate (FORBID_TAGS bypass, GHSA-39q2-94rc-95cp) | PDF path sanitizer | available |
| `react-router` / `react-router-dom` | Moderate (open redirect via `//`, GHSA-2j2x-hqr9-3h42) | routing | available |
| `tar` (via `supabase` CLI) | Moderate (file-smuggling parser differential) | tooling | available |

Full dev+prod audit: **18 vulnerabilities — 2 critical, 5 high, 9 moderate, 2 low.** Dev-only criticals/highs (not shipped to users) include `vitest` (CVSS 9.8, test-UI-server only), `vite`, `esbuild`, `flatted`, `picomatch`, `undici` — relevant to CI/dev machines, lower runtime exposure.

**Remediation:** run `npm audit fix`, then re-run `npx tsc --noEmit --skipLibCheck` and `npm run build` to confirm no breakage before committing the lockfile.

## MEDIUM — carried

- **`public-quote` unauthenticated state mutation** (from 07-08) — token-gated service-role endpoint; validates UUID token, returns client-safe fields only. Recommend per-token/IP rate limiting. Not re-deep-reviewed this run.
- **Supabase advisor items** (public storage bucket listing; `SECURITY DEFINER` functions callable by anon/authenticated) — carried from earlier runs, **not re-verified** (no live DB session this run).

## LOW

1. **Client-side PDF `innerHTML` sinks** — `src/components/InvoiceViewModal.tsx:172` and `src/pages/Payouts.tsx:595` assign to `container.innerHTML` for html2pdf rasterization. Payouts validates+escapes the template `src` (`safeTemplateSrc`, allow-lists `data:image/*;base64` / `https:`), and text fields use the shared `escapeHtml` helper. Off-screen detached container. Residual risk low; keep `escapeHtml` applied to any newly interpolated field.
2. **Transistorsoft bg-geolocation license token** in `android/app/src/main/res/values/strings.xml` — client-side product license, expected to ship, not a credential leak. Informational.

## Notes / follow-up

- **2 HIGH findings** (`send-email` relay, vulnerable prod deps) meet the task's push-notification threshold, but no push/notify tool is available in this unattended run. Both are unchanged from 2026-07-08 — no new escalation. Flagging for follow-up when a human is present.
- No code was modified. This was a read-only scan; only this log file was written.
