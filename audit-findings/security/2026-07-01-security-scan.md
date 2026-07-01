# Security Scan — ConnecTradie — 2026-07-01

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `auto-fixes/2026-07-01` (working tree clean).
**Notification sent:** No — no CRITICAL or HIGH findings.

## Summary

No exposed secrets, no authentication bypass, no SQL injection, and no missing RLS were found. Every database table has row-level security enabled. All findings this run are WARN-level best-practice items (MEDIUM/LOW). This is the first entry in `audit-findings/security/`, so there is no prior baseline to diff against.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 3 groups |
| LOW      | 2 |

## Scan coverage & method

- **Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree instead.
- Secret scan across `src/`, `supabase/`, `scripts/`, `public/`, `e2e/`, and root configs (excluded `node_modules`, `dist`, archives, lockfile).
- Live Supabase project security advisors queried (project `uoqygmizupdpanplpvor`, "Connectradie", read-only).
- Local migrations analysed for RLS coverage.

---

## CRITICAL — none

- **Exposed secrets:** No `sk_live_`/`sk_test_` Stripe secret keys, no full JWTs, and no private keys found in source. The only secret-shaped strings are placeholders in `.env.example` and `env(...)` references in `supabase/config.toml`.
- **`.env` handling:** `.env` is listed in `.gitignore`, is **not** tracked by git, and does not appear in git history. Only `.env.example` is committed, and it contains placeholders only (`your-...-here`, `pk_test_your_...`).
- **Service role key:** `SUPABASE_SERVICE_ROLE_KEY` is referenced only in server-side edge functions via `Deno.env.get(...)`. **Zero** occurrences in client-side `src/`.
- **Auth bypass:** No unauthenticated privileged routes found. Two edge functions run with `verify_jwt = false` (`stripe-webhook`, `google-calendar-oauth`) — both are intentional public endpoints that perform their own signature / CSRF verification (standard Supabase pattern).

## HIGH — none

- **RLS:** 70 `CREATE TABLE` statements, 70 `ENABLE ROW LEVEL SECURITY` statements, 474 `CREATE POLICY` statements across 220 migration files. All 69 unique tables have an explicit RLS-enable. No tables created without RLS.
- **Live advisors:** No ERROR-level lints (no RLS-disabled tables exposed to the API).
- **SQL injection:** No raw SQL with string interpolation. All DB access uses the Supabase query builder / parameterized RPC. Template-literal matches were user-facing message strings and log lines, not SQL.
- **Vulnerable dependencies:** No known-vulnerable packages in `package.json`. Core stack is current (React 18.3, Vite 7.3, `@supabase/supabase-js` 2.57, Stripe SDKs current). No `npm audit` could be run (no network); recommend a periodic `npm audit` in CI.

## MEDIUM

1. **Public storage buckets allow listing (Supabase advisor, 5 buckets).** Buckets `avatars`, `cover-photos`, `job-images`, `job-photos`, and `portfolio-images` each have a broad `SELECT` policy on `storage.objects` that lets any client *list* every file in the bucket. Public object URLs work without this, so the listing policy exposes more than intended. Consider scoping or removing the broad SELECT policy.
   Ref: https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing

2. **`SECURITY DEFINER` functions callable by `anon` / `authenticated` (Supabase advisor).** Several RPCs run as `SECURITY DEFINER` and are executable via `/rest/v1/rpc/...`. Anon-callable: `get_daily_profile_view_count`, `has_user_engagement`, `search_businesses_by_name`. Authenticated-callable (additional): `can_read_job_attachment`, `create_notification`, `delete_user_account`, `employer_approve_member`/`decline`/`remove`, `get_user_conversation_ids`, `is_admin`, `is_conversation_creator`, `is_tradie_verified`. Most appear intentional (search, helper predicates, member management), but each should be confirmed to enforce its own authorization internally, or have `EXECUTE` revoked / switched to `SECURITY INVOKER` where public access is not intended. Of note: `delete_user_account` and the `employer_*_member` mutations should be double-checked for internal caller checks.
   Ref: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

3. **`innerHTML` used for PDF/print generation (2 sites).** `src/components/InvoiceViewModal.tsx:167` and `src/pages/Payouts.tsx:577` build HTML via `innerHTML` for offscreen html2pdf rendering. The InvoiceViewModal case wraps React-rendered DOM (already escaped) — low risk. The Payouts case interpolates `${customInvoiceTemplate}` into an `<img src="...">`; since that value is a user-uploaded template reference, it should be validated/escaped before interpolation. No `dangerouslySetInnerHTML` and no `eval()` anywhere in the codebase.

## LOW (best-practice, logged only)

1. Add a recurring `npm audit` (or Dependabot) check in CI so dependency CVEs are caught between these scans, since the automated environment has no network for live auditing.
2. Repo hygiene: large source archives (`connectradie.zip`, `connectradie.tar.gz`, `src.zip`) are present in the working tree. They are gitignored, but storing full source archives beside the repo is a mild exposure risk if the folder is ever shared. The gitignored `.env` also contains real key-shaped values (expected) — ensure the folder itself is never shared.

---

*Read-only scan. No files were modified, staged, committed, or pushed. This report is the only file written.*
