# Security Scan — ConnecTradie — 2026-07-01

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `auto-fixes/2026-07-01`. **Working tree:** dirty (uncommitted changes to 2 edge functions — see Changes since last run).
**Notification sent:** No — no CRITICAL or HIGH findings.
**Note:** This is a re-run on the same date; this file supersedes the earlier 2026-07-01 entry and adds a diff against it.

## Summary

No exposed secrets, no authentication bypass, no SQL injection, and no missing RLS. Every database table has row-level security enabled and there are no ERROR-level live advisors. All findings remain WARN-level best-practice items (MEDIUM/LOW). Posture is unchanged-to-slightly-improved versus the prior run today: one prior MEDIUM (unsanitised `innerHTML` in `Payouts.tsx`) has been remediated, and two edge functions had debug logging removed. One new item: a storage-hardening migration is committed but not yet applied to the live database.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 3 groups |
| LOW      | 2 |

## Changes since last run (2026-07-01 earlier)

- **FIXED — `Payouts.tsx` `innerHTML` injection risk.** The custom invoice template is now validated (must match `data:image/*;base64,...` or `https://...`) and HTML-escaped before interpolation into the offscreen html2pdf container (`src/pages/Payouts.tsx:567–593`). Previously flagged MEDIUM; now mitigated.
- **IMPROVED — debug logging removed from auth paths.** Uncommitted working-tree edits to `supabase/functions/verify-abn/index.ts` and `supabase/functions/verify-license/index.ts` delete `console.log` lines that echoed Authorization-header presence and user-fetch results. Auth checks (`Authorization` required, `supabase.auth.getUser()`) remain intact. Net positive; no regression.
- **NEW (low risk) — additional `innerHTML` site.** `src/components/LicenseCertificate.tsx:309` writes `printContent.innerHTML` (already-rendered, escaped React DOM) into a print window. Same low-risk print/PDF class as `InvoiceViewModal.tsx`; no user-controlled interpolation.
- **NEW (tracking) — bucket-listing fix committed but not deployed.** Migration `supabase/migrations/20260701000000_scope_public_bucket_select_policies.sql` (commit `3aa2ca7`) is intended to close advisor lint 0025, but the live project still reports all 5 buckets with broad SELECT — the migration has not been applied to prod (`supabase db push` pending). See MEDIUM #1.
- **RLS/policy counts:** 70 tables / 70 RLS-enable / **479** `CREATE POLICY` (was 474) — 5 new policies, consistent with recent migration work. No table without RLS.

## Scan coverage & method

- **Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree instead.
- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `e2e/`, `index.html`, and built `dist/` (excluded `node_modules`, archives, lockfile).
- Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only).
- Local migrations analysed for RLS coverage; git working-tree diff reviewed.

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no full private-key JWTs, and no private keys in source. Only secret-shaped strings are placeholders in `.env.example` and `env(...)` refs in `supabase/config.toml`.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders only).
- **Service role key:** `SUPABASE_SERVICE_ROLE_KEY` appears only in server-side edge functions via `Deno.env.get(...)`. Zero occurrences in client `src/`.
- **`dist/` bundle check:** The only JWTs baked into the built client are the Supabase **anon** key (`"role":"anon"`), which is designed to be public and is protected by RLS. The `service_role` string in the `.js.map` is library warning text, not a key. No secret leakage in the shipped bundle.
- **Auth bypass:** No unauthenticated privileged routes. Two edge functions run `verify_jwt = false` (`stripe-webhook`, `google-calendar-oauth`) — intentional public endpoints that perform their own signature / CSRF verification.

## HIGH — none

- **RLS:** 70 `CREATE TABLE`, 70 `ENABLE ROW LEVEL SECURITY`, 479 `CREATE POLICY` across migrations. All tables have explicit RLS-enable. Live advisors report **no ERROR-level** lints (no RLS-disabled tables exposed to the API).
- **SQL injection:** No raw SQL with string interpolation. All DB access via the Supabase query builder / parameterized RPC.
- **Vulnerable dependencies:** No known-vulnerable packages in `package.json`. Core stack current (React 18.3, `@supabase/supabase-js` 2.57, `@stripe/stripe-js` 8.7, `@sentry/react` 10.40, Capacitor 8.x). No `npm audit` possible (no network) — recommend CI-based auditing.

## MEDIUM

1. **Public storage buckets allow listing (Supabase advisor, 5 buckets: `avatars`, `cover-photos`, `job-images`, `job-photos`, `portfolio-images`).** Each has a broad `SELECT` policy on `storage.objects` letting any client *list* every file. A remediation migration (`20260701000000_scope_public_bucket_select_policies.sql`) is committed but **not yet applied to the live database** — the advisor still flags all 5. Action: apply the migration (`supabase db push`) and re-run advisors to confirm closure.
   Ref: https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing

2. **`SECURITY DEFINER` functions callable by `anon` / `authenticated` (Supabase advisor).** Anon-callable: `get_daily_profile_view_count`, `has_user_
---

# Security Scan — Run 2 — 2026-07-01 23:07 AEST

**Run mode:** automated (unattended, read-only). **Branch scanned:** `auto-fixes/2026-07-01`.
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree (3 uncommitted modifications present).
**Notification status:** 1 HIGH finding identified (see below). No push-notification tool is available in this automated run, so this could not be dispatched — flagging here for follow-up.

## What changed since the previous run (18:08 today)

- **RESOLVED — Payouts template `<img src>` injection (was MEDIUM #3):** `src/pages/Payouts.tsx` now validates `customInvoiceTemplate` against a strict `data:image/*;base64` / `https:` allow-list and HTML-escapes it before interpolation (see the `safeTemplateSrc` block, ~lines 565–585). The specific concern from the prior scan is fixed.
- **NEW — unescaped user text in the same invoice HTML (HIGH, see below).** The prior scan flagged only the image `src`; it missed that the invoice's text fields are interpolated without escaping. This is more serious and still present.
- **Uncommitted local edits:** `supabase/functions/verify-abn/index.ts` and `verify-license/index.ts` — both only remove `console.log` lines that echoed auth-header presence and user-fetch results. Benign, mild logging-hygiene improvement. No secrets were logged (only booleans), so not a finding.

## HIGH — Stored XSS via unescaped invoice fields in receipt/PDF generation

**File:** `src/pages/Payouts.tsx`, `handleDownloadInvoice` — `const html = ` template at line ~463, injected via `container.innerHTML = finalHtml` at line ~593.

The receipt HTML interpolates user-controlled fields directly, with no HTML escaping:

- `${p.client_name}` (line ~491) — derived from the homeowner's profile display name (`clientMap`, free-text, attacker-controlled).
- `${jobTitle}` (lines ~509, ~521) — derived from `p.jobs.title` / `p.jobs.description` (free-text set by the homeowner when posting the job).

The resulting string is assigned to `container.innerHTML`, and the container is appended to `document.body` and rendered by `html2pdf.js` (html2canvas). Because the node is inserted into the live document, an `<img src=x onerror=...>` or similar payload executes in the browser of the **tradie** who downloads the receipt — a different, authenticated user from the one who supplied the data. That makes this a cross-user stored XSS, not merely a self-XSS.

There is no `escapeHtml`/sanitize helper in the file; only the template image `src` is sanitized. `html2pdf.js` does not sanitize input.

**Recommended fix (not applied — read-only scan):** HTML-escape every interpolated data field (`client_name`, `jobTitle`, `invoiceNum`, `statusText`) with a small `escapeHtml()` helper (`& < > " '`), matching the pattern already used for `safeTemplateSrc`. Apply the same treatment to any other `innerHTML`/print-window builders that take DB text. `src/components/InvoiceViewModal.tsx` (`printRef.current.innerHTML`, line ~167) re-serialises already-React-escaped DOM and is lower risk, but should be reviewed for the same class of issue.

## Re-confirmed clean (unchanged from Run 1)

- No exposed secrets (`sk_live_`/`sk_test_`, JWTs, private keys); `.env` untracked and absent from history; `.env.example` placeholders only.
- No `SUPABASE_SERVICE_ROLE` / Stripe secret keys in client `src/`.
- Stripe webhook validates signatures (`stripe.webhooks.constructEventAsync`).
- RLS: 70 `CREATE TABLE` / 70 `ENABLE ROW LEVEL SECURITY` / 479 `CREATE POLICY` across 221 migrations — no table created without RLS.
- No SQL string-interpolation; RPC calls parameterised. No `eval()` / `dangerouslySetInnerHTML`. No auth tokens in `localStorage`.
- Dependencies current; no known-vulnerable packages in `package.json`. (Live `npm audit` not runnable — no network.)

## Still-open MEDIUM items carried from Run 1

1. Public storage buckets allow listing (advisor lint 0025) — 5 buckets.
2. `SECURITY DEFINER` RPCs executable by `anon`/`authenticated` (advisor lint 0029) — verify internal authz, esp. `delete_user_account`, `employer_*_member`.

*Read-only scan. No files were modified, staged, committed, or pushed other than this findings log.*

---

# Remediation — HIGH stored XSS — 2026-07-01 23:1x AEST (manual fix)

**Status: RESOLVED.**

`src/pages/Payouts.tsx`:
- Added a module-level `escapeHtml()` helper (escapes `& < > " '`).
- Applied it to every user/DB-controlled field interpolated into the receipt `innerHTML`: `client_name`, `jobTitle` (both the Bill-To line and the line-item cell), `invoiceNum`, `date`, and `statusText`. Numeric (`amountDollars`) and code-controlled (`statusColor`) values left as-is.

Malicious homeowner display names or job titles are now rendered as inert text instead of executing in the tradie's browser during PDF/receipt generation. `npx tsc --noEmit --skipLibCheck` passes with no errors. No other files changed.

## Follow-up hardening — InvoiceViewModal.tsx

Reviewed the full `printRef` subtree: every invoice field is rendered as a JSX text child (React-escaped) and there is no `dangerouslySetInnerHTML`, so the `printContents = printRef.current.innerHTML` re-serialization in both `handlePrint` and `handleDownloadPdf` is safe by construction and was left unchanged (escaping it would double-escape legitimate characters).

One genuine raw sink was found and fixed: the print window `<title>Invoice ${invoice.invoice_number}</title>` is written via `document.write`, bypassing React. Added an `escapeHtml()` helper and applied it there. `npx tsc --noEmit --skipLibCheck` passes.
