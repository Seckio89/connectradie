# Security Scan — ConnecTradie — 2026-07-16

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master`. **Working tree:** dirty (uncommitted changes across ~14 files incl. `package.json`, `package-lock.json`, `src/App.tsx`, several components — not modified by this scan).
**Notification warranted:** **YES — HIGH findings** (vulnerable production dependencies). No push-notification tool is available in this automated environment, so this is flagged at the top of the report and in the run output instead.

## Summary

No exposed secrets, no authentication bypass, no SQL injection, and no missing RLS. Every database table (79 created / 80 `ENABLE ROW LEVEL SECURITY`) has row-level security enabled, and the live Supabase advisors return **no ERROR-level lints** — only WARN-level `SECURITY DEFINER` notices.

The material change this run is **dependency vulnerabilities**: `npm audit` now reports 18 total (2 critical, 5 high, 9 moderate, 2 low), of which **6 are in production runtime dependencies** (1 critical, 1 high, 4 moderate). The critical is `jspdf 4.2.0` (pulled in by `html2pdf.js`, used for client-side invoice/receipt PDF generation). This is the first run to surface these, consistent with the recent `package.json` / lockfile changes in the working tree.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 (no exposed secrets / auth bypass) |
| HIGH     | 1 group — vulnerable production dependencies (incl. a CRITICAL-rated npm advisory) |
| MEDIUM   | 3 groups |
| LOW      | 2 |

## Scan coverage & method

- **Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree instead. Working tree is on branch `master` with uncommitted changes.
- Secret scan across `src/`, `supabase/`, `api/`, `scripts/`, `public/`, `index.html` (excluded `node_modules`, archives, lockfile).
- `npm audit` run (full and `--omit=dev`) with network access.
- Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only).
- Local migrations analysed for RLS coverage; git working-tree diff reviewed.

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no service-role keys, and no private keys/certificates in source. The only JWT in source is the **public anon key** hardcoded in `api/quote-og.ts:22` (role `anon`) — this is the same key that ships in the web bundle and is safe to expose by design (see LOW #1). No hardcoded passwords/secrets outside a `test-token` mock in `src/__tests__/setup.ts`.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. Only `.env.example` is committed (placeholders only).
- **Auth bypass:** No service-role key in client code (`src/`). RLS enabled on all tables; no ERROR-level advisor lints.

---

## HIGH — vulnerable production dependencies

`npm audit --omit=dev` reports **6 vulnerabilities in runtime dependencies** (1 critical, 1 high, 4 moderate). Fixes are available via `npm audit fix`. **This scan does not modify code or dependencies** — remediation is left to the maintainer.

| Package | Installed | Severity (npm) | Path | Issue |
|---------|-----------|----------------|------|-------|
| **jspdf** | 4.2.0 | **CRITICAL** | `html2pdf.js > jspdf` | PDF Object Injection via FreeText color; HTML Injection in new-window paths ([GHSA-7x6v-j9x4-qf24](https://github.com/advisories/GHSA-7x6v-j9x4-qf24), [GHSA-wfv2-pwc8-crg5](https://github.com/advisories/GHSA-wfv2-pwc8-crg5)) |
| **ws** | 8.x (transitive) | **HIGH** | transitive | Uninitialised memory disclosure; memory-exhaustion DoS ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)) |
| dompurify | 3.3.2 | moderate | `html2pdf.js > (js)pdf > dompurify` | Multiple sanitizer-bypass / prototype-pollution XSS advisories |
| react-router / react-router-dom | 6.30.3 | moderate | direct | Open redirect via protocol-relative `//` path ([GHSA-2j2x-hqr9-3h42](https://github.com/advisories/GHSA-2j2x-hqr9-3h42)) |
| tar | ≤7.5.15 | moderate | transitive | PAX header parsing differential / file smuggling ([GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh)) |

**Impact notes.** `jspdf`/`html2pdf.js` runs client-side to render invoices and receipts (`src/pages/Payouts.tsx`, `src/components/InvoiceViewModal.tsx`) from data that includes user- and counterparty-authored fields (job descriptions, business/tradie names). The jsPDF injection classes are therefore reachable in principle, though the app already HTML-escapes and validates the template source before handing markup to the PDF pipeline (see MEDIUM #2), which reduces practical exploitability. The `react-router` open-redirect matters for a web app that builds redirect targets from URL/query input — worth confirming no redirect uses raw `//`-prefixed paths.

**Recommended action (maintainer):** run `npm audit fix` and re-test PDF export; where `html2pdf.js` pins an old `jspdf`, consider upgrading `html2pdf.js` or moving to a maintained fork. Re-run the type-check/build and PDF-export smoke test afterward.

Dev-only vulnerabilities (not shipped to users) additionally include `vitest` (critical, UI-server arbitrary file read/exec) and `vite` — relevant only to the local dev/test environment; patch during normal dependency maintenance.

---

## MEDIUM

**1. Supabase `SECURITY DEFINER` functions executable by `anon` / `authenticated` (advisor WARN).**
Live advisors flag several `SECURITY DEFINER` RPCs callable without/with sign-in via `/rest/v1/rpc/*`. Most are legitimate RLS helpers (`is_admin`, `is_tradie_verified`, `get_user_conversation_ids`, `is_conversation_creator`) that must be definer to work inside policies — low concern. A few warrant a review of whether they should be `anon`-reachable at all:

- `enforce_external_pay_tier()` and `flag_offplatform_payment()` — names suggest trigger/enforcement logic; being directly `anon`-executable via RPC looks unintended.
- `search_businesses_by_name(text)`, `get_daily_profile_view_count(uuid)`, `get_service_worker_details(uuid)`, `get_team_site_activity(timestamptz)` — confirm each intentionally exposes only non-sensitive data to anonymous callers.

Remediation per function: revoke `EXECUTE` from `anon`/`authenticated`, or switch to `SECURITY INVOKER` where the definer privilege isn't needed. Ref: <https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable>

**2. `innerHTML` sinks in client-side PDF/print builders (mitigated, keep watching).**
`src/components/InvoiceViewModal.tsx:172` and `src/pages/Payouts.tsx:642` assign to `container.innerHTML` when building offscreen PDF markup. Both feed from already-escaped React DOM (`printRef.current.innerHTML`) and app-constructed strings; `Payouts.tsx` additionally validates and HTML-escapes any custom template source (`data:image/*;base64` or `https:` only) before interpolation. No unsanitised user data reaches these sinks today. Flagged so any future change that interpolates raw DB/user text here is caught — prefer the shared escape helper for all such sinks.

**3. React Router open-redirect advisory (see HIGH table).** Tracked here as the code-side follow-up: audit any redirect logic that could accept a caller-supplied `//host` path.

---

## LOW

**1. Hardcoded public anon key in `api/quote-og.ts:22`.** The Supabase anon JWT is inlined (with a code comment noting it is the public bundle key, used only for the token-gated read-only public-quote function). Safe to expose, but for consistency/rotation hygiene prefer reading it from an environment variable rather than a source literal.

**2. `.gitignore` covers `.env` but not all env variants.** `.env` and `*.local` (so `.env.local`) are ignored, but `.env.production` / `.env.development` are not explicitly ignored. No such files are currently tracked; add `.env.*` (with a `!.env.example` exception) to prevent an accidental future commit.

---

## Posture vs. previous runs

Prior daily runs (through 2026-07-15) reported 0 CRITICAL / 0 HIGH. Secret hygiene, RLS coverage, and print/PDF escaping remain in the same good state. The **new** item this run is the dependency-vulnerability surface (`npm audit`), driven by the recent `package.json`/lockfile changes in the working tree — this is why a notification is warranted today. Code-level security posture (secrets, RLS, injection, auth) is unchanged and clean.

_Read-only scan. No code, dependencies, or database objects were modified._
