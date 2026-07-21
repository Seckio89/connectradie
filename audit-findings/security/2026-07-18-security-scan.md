# Security Scan — ConnecTradie — 2026-07-18

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master`. **Working tree:** dirty (uncommitted changes to Android/Capacitor mobile files, service worker, and two build scripts — unrelated to backend security).
**HEAD:** `ff4cd1c fix(jobs): funded-aware completion, locked prices, honest payment status`.
**Notification sent:** No — no CRITICAL or HIGH findings.

## Summary

No exposed secrets, no authentication bypass, no SQL injection, and no missing RLS. All 79 database tables have row-level security enabled. Live Supabase security advisors report **zero ERROR-level** issues — only WARN-level `SECURITY DEFINER`-function-exposure lints. Posture is consistent with recent daily scans: all findings are best-practice items (MEDIUM/LOW).

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 1 group (9 anon-executable SECURITY DEFINER functions) |
| LOW      | 3 |

## Scan coverage & method

- **Git pull:** `git pull origin master` fetched `ff4cd1c..d6941e2`; merge blocked by uncommitted working-tree changes, so the current local tree (at `ff4cd1c`) was scanned.
- **Secret scan** across `src/`, `supabase/`, `api/`, `scripts/`, `public/`, `index.html`, `.env*` (excluded `node_modules`, `dist`, `public-clean`, `*.zip`/`*.tar.gz`, lockfile).
- **Dependencies** reviewed from `package.json` (offline; no live `npm audit` available in this environment).
- **265 migrations** analysed for RLS coverage and policy scope (**528** `CREATE POLICY` statements).
- **Live Supabase security advisors** queried (project `uoqygmizupdpanplpvor`, read-only).

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no `whsec_`/`rk_` keys, no full private-key JWTs, and no PEM private keys anywhere in tracked source. The only JWT in source is the **public anon-role key** (see LOW #1), which is designed to ship in the client bundle.
- **`.env` handling:** `.env` is gitignored, not tracked, and absent from git history. `.env.example` is committed with placeholders only.
- **No authentication bypass** identified in RLS policies or edge-function auth checks.

## HIGH — none

- **RLS coverage:** All 79 tables created across migrations have `ENABLE ROW LEVEL SECURITY` (79/79). No sensitive table (payments, `stripe_*`, `profiles`, `messages`, `invoices`) is anon-readable; SELECT policies on those are scoped to `auth.uid()` ownership. `USING (true)` policies are confined to public reference/marketplace data (`trade_categories`, `pricing_tiers`, `portfolio_images`, `reviews`, tradie profiles/availability, public vacancies) and `service_role`-only `FOR ALL` grants.
- **SQL injection:** Edge-function DB access uses parameterised `supabase.rpc()` calls (named args) and the query builder — no raw string-interpolated SQL found.
- **Dependencies:** No known-vulnerable packages identified by manual review. Versions are current (React 18.3, Vite 7.3, `@supabase/supabase-js` 2.57, Sentry 10.40, Stripe JS 8.7). Recommend a live `npm audit` in CI to confirm the transitive tree, which this offline run could not reach.

## MEDIUM

1. **9 `SECURITY DEFINER` functions are executable by the `anon` (unauthenticated) role.** Live advisors (lint `0028`) flag: `enforce_external_pay_tier`, `flag_offplatform_payment`, `get_daily_profile_view_count`, `get_service_worker_details`, `get_team_site_activity`, `has_user_engagement`, `lock_profile_billing_columns`, `lock_tradie_billing_columns`, `search_businesses_by_name`. Several of these are trigger functions (`enforce_external_pay_tier`, `flag_offplatform_payment`, `lock_*_billing_columns`) that have no reason to be reachable via `/rest/v1/rpc/...` at all, and the data-returning ones (`get_service_worker_details`, `get_team_site_activity`, `search_businesses_by_name`) run with definer privileges and should verify the caller internally. A remediation migration `20260717090000_revoke_anon_security_definer_fns.sql` is committed but these functions are still live-flagged — the migration appears not yet applied to prod, or does not cover this set. **Action:** `REVOKE EXECUTE ... FROM anon` on trigger functions, and confirm each data-returning function enforces `auth.uid()` before returning rows; then `supabase db push`.
   Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## LOW

1. **Public anon key hardcoded in `api/quote-og.ts:22`.** The Supabase `anon`-role JWT is inlined (with an explanatory comment) for the token-gated read-only OG-quote function. This key is public by design (it also ships in the web bundle), so this is not a secret leak — but sourcing it from an environment variable would be cleaner and avoids churn on key rotation.
2. **17 `SECURITY DEFINER` functions executable by `authenticated`** (live advisor lint `0029`), e.g. `delete_user_account`, `employer_*_member`, `create_notification`, `is_admin`. These require a signed-in session and are generally intended, but each should be confirmed to authorise the specific caller rather than relying on definer rights alone.
   Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
3. **Geofence token cached in `localStorage`** (`src/lib/siteGeofence.ts:105,120`). A device geofence token — not the Supabase auth session — is stored in `localStorage`. Low impact (short-lived, site-scoped); note only. Supabase auth itself uses the SDK default session storage in `src/lib/supabase.ts`, which is standard for this SPA.

## Notes on unsafe-HTML review (no finding)

The two `innerHTML` sinks (`src/pages/Payouts.tsx:643`, `src/components/InvoiceViewModal.tsx:172`) were reviewed. Both build offscreen PDF/print markup; all user/DB-controlled fields are passed through `escapeHtml` (client name, job title, invoice number, status), and the custom-template `src` is validated (`data:image/*;base64` or `https:`) and attribute-escaped before interpolation. No injection path found. No `dangerouslySetInnerHTML`, `eval()`, or `new Function()` in `src/`.

---

*Generated by the automated security-scanner scheduled task. Read-only — no code or database changes were made.*
