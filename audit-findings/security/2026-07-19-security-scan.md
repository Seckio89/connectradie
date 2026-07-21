# Security Scan — ConnecTradie — 2026-07-19

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master`. **Working tree:** dirty (uncommitted changes present — unrelated to backend security).
**HEAD:** `143589f fix(help): don't render an empty "Quick tips" label when there are no tips`.
**Notification sent:** Yes — **HIGH** findings present (vulnerable production dependencies).

## Summary

No exposed secrets, no authentication bypass, no SQL injection, and no missing RLS — the codebase posture is unchanged and clean. **The material change this run:** a live `npm audit` (which earlier offline scans could not run) surfaced **18 known dependency vulnerabilities — 2 critical, 5 high, 9 moderate, 2 low**. The most important is **`jspdf@4.2.0` (CRITICAL)**, pulled in as a **production runtime dependency** via `html2pdf.js` (used for client-side invoice/receipt/attendance PDF generation). Most of the remaining high/critical items are dev-tooling only (Vite, Vitest, supabase CLI transitive deps).

| Severity | Count | Notes |
|----------|-------|-------|
| CRITICAL | 0 | No exposed secrets / auth bypass |
| HIGH     | 1 group | Vulnerable dependencies (2 critical + 5 high CVEs; 1 critical in a production package) |
| MEDIUM   | 1 group | 9 anon-executable `SECURITY DEFINER` functions (unchanged from prior runs) |
| LOW      | 3 | Hardcoded public anon key; 17 authenticated definer fns; geofence token in localStorage |

## Scan coverage & method

- **Git:** `git pull origin master` → already up to date at `143589f`.
- **Secret scan** across `src/`, `supabase/`, `api/`, `public/`, `index.html`, `.env*` (excluded `node_modules`, `dist`, `public-clean`, archives, lockfile).
- **Dependencies:** live `npm audit --package-lock-only` against `package-lock.json` (**this ran successfully today**, unlike recent offline runs).
- **Migrations** cross-checked: every `CREATE TABLE` has a matching `ENABLE ROW LEVEL SECURITY` (0 tables missing RLS).
- **Live Supabase security advisors** queried (project `uoqygmizupdpanplpvor`, read-only).

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no `whsec_` webhook secrets, no `AIza…` Google keys, no PEM private keys in tracked source. The only JWT in source is the **public anon-role key** (see LOW #1), designed to ship in the client bundle.
- **`.env` handling:** `.env` is gitignored, not tracked, and never appears in git history. `.env.example` contains placeholders only. `supabase/config.toml` uses `env(...)` references, not literal secrets.
- **No authentication bypass** identified.

## HIGH — Vulnerable dependencies (notify)

Live `npm audit` reports **18 vulnerabilities (2 critical, 5 high, 9 moderate, 2 low)**. Fix path for the tree: `npm audit fix` (some require review — see below).

**Production-impacting (client bundle):**

| Package | Severity | Path | Note |
|---------|----------|------|------|
| `jspdf` `<=4.2.0` | **CRITICAL** | `html2pdf.js@0.14.0 › jspdf@4.2.0` | Direct prod dep `html2pdf.js` pins the vulnerable `jspdf`. Used for client-side PDF generation (invoices, receipts, attendance reports). `html2pdf.js@0.14.0` is already the latest, so `npm audit fix` may not resolve without an upstream fix or a jspdf override. **Impact is client-side (affects the user rendering the PDF), not the server.** Consider a `jspdf` override or migrating off `html2pdf.js`. |
| `dompurify` `<=3.4.10` | MODERATE | via `jspdf`/`html2pdf.js` | XSS-sanitiser bypass advisory; same remediation as jspdf. |
| `react-router-dom` `6.6.3-6.30.3` | MODERATE | direct | Upgrade within v6 (or to v7) resolves. |
| `postcss` `<8.5.10` | MODERATE | direct (build) | Line-parsing advisory; bump patch. |

**Dev-tooling only (not shipped to users):**

| Package | Severity | Note |
|---------|----------|------|
| `vitest` `>=4.0.0 <4.1.0` | **CRITICAL** | UI server arbitrary file read/exec — dev-only, only when Vitest UI is running. |
| `vite` `7.0.0-7.3.3` | HIGH | Multiple dev-server path-traversal / `fs.deny` bypass advisories. |
| `undici` `7.0.0-7.27.2` | HIGH | Transitive via `supabase` CLI (dev). |
| `ws` `8.0.0-8.20.1` | HIGH | Transitive (dev). |
| `flatted`, `picomatch` | HIGH | Build/lint transitive. |
| `brace-expansion`, `js-yaml`, `tar`, `yaml` | MODERATE | Transitive (dev/build). |
| `@babel/core`, `esbuild` | LOW | Transitive (dev). |

**Action:** run `npm audit fix` in CI; for `jspdf`, add a package override or evaluate replacing `html2pdf.js`, since it is the one critical CVE reaching the production bundle. Dev-only criticals (Vitest) are low real-world risk but should still be patched.

*Note: this is the first run in the recent series to obtain a live `npm audit` result — prior reports stated "no known-vulnerable packages" based on manual version review, which could not see the transitive tree. The tree was always in this state; today's scan simply had the tooling to detect it.*

## MEDIUM

1. **9 `SECURITY DEFINER` functions executable by the `anon` (unauthenticated) role** (unchanged from prior runs). Live advisor lint `0028` flags: `enforce_external_pay_tier`, `flag_offplatform_payment`, `get_daily_profile_view_count`, `get_service_worker_details`, `get_team_site_activity`, `has_user_engagement`, `lock_profile_billing_columns`, `lock_tradie_billing_columns`, `search_businesses_by_name`. The trigger functions (`enforce_external_pay_tier`, `flag_offplatform_payment`, `lock_*_billing_columns`) have no reason to be reachable via `/rest/v1/rpc/…`; the data-returning ones run with definer privileges and should verify the caller internally. **Action:** `REVOKE EXECUTE … FROM anon` on the trigger functions; confirm each data-returning function enforces `auth.uid()` before returning rows; then `supabase db push`.
   Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## LOW

1. **Public anon key hardcoded in `api/quote-og.ts:22`.** The Supabase `anon`-role JWT is inlined (with an explanatory comment) for the token-gated read-only OG-quote Vercel edge function. Public by design (it ships in the web bundle), so not a secret leak — but sourcing it from an env var would be cleaner for key rotation.
2. **17 `SECURITY DEFINER` functions executable by `authenticated`** (advisor lint `0029`), e.g. `delete_user_account`, `employer_*_member`, `create_notification`, `is_admin`. Require a signed-in session and are generally intended; each should authorise the specific caller rather than relying on definer rights alone.
   Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
3. **Geofence consent/token cached in `localStorage`** (`src/lib/siteGeofence.ts`). A short-lived, site-scoped device geofence value — not the Supabase auth session. Low impact. Supabase auth uses the SDK default session storage, standard for this SPA.

## Unsafe-HTML / injection review (no finding)

- No `dangerouslySetInnerHTML`, no `eval()`, no `new Function()` in `src/`.
- Three `innerHTML` sinks (`src/components/InvoiceViewModal.tsx:172`, `src/pages/JobTracking.tsx:74`, `src/pages/Payouts.tsx:659`) build offscreen PDF/print markup. `JobTracking` passes all dynamic fields through `escapeHtml`; `Payouts` validates the custom-template `src` (`data:image/*;base64` or `https:` only) and attribute-escapes it; `InvoiceViewModal` reuses already React-rendered DOM. No injection path found.
- No raw string-interpolated SQL in edge functions — Supabase query builder / parameterised `rpc()` used throughout.

## RLS / auth (no finding)

- Every table created across migrations has `ENABLE ROW LEVEL SECURITY` (0 missing).
- Live Supabase advisors report **zero ERROR-level** security lints — only the WARN-level definer-function items above.

---

*Generated by the automated security-scanner scheduled task. Read-only — no code or database changes were made.*
