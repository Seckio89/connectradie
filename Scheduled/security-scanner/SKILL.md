---
name: security-scanner
description: [RETIRED — superseded by check:secrets, check:sinks, check:deps and Supabase advisors. Kept as history; do not rely on it.]
---

> **This skill does not run, and the 2026-07-01 note that said it had been
> "merged into nightly-code-audit" was wrong.** None of its five scan steps
> made it across. The nightly audit ran the checker suite, advisors and edge
> logs, and nothing here. The gap was real: a Google OAuth client secret sat in
> `.claude/settings.json` in a public repo for roughly two months while the
> monthly reports below kept saying "no exposed secrets" — see
> `audit-findings/security/*.md`, every one of which asserts that.
>
> It would not have caught it even had it run. Its patterns were `sk_live_`,
> `sk_test_`, `eyJ` and `SUPABASE_SERVICE_ROLE`, none of which match Google's
> `GOCSPX-` prefix; and it scanned `src/`, `supabase/`, config files and
> `.env*`, never `.claude/`.
>
> Where each step actually lives now, as of 2026-08-03:
>
> | Step below | Now |
> |---|---|
> | 2. Exposed secrets | `npm run check:secrets` — blocking CI, scans **all** tracked files, plus `check:secrets:history` |
> | 3. Dependency vulnerabilities | `npm run check:deps` — ratchet on `.audit-baseline.json`; criticals cannot be baselined |
> | 4. Config / `.gitignore` hygiene | folded into `check:secrets` |
> | 4. Unsafe eval / innerHTML / SQL | `npm run check:sinks` — ratchet on `.sinks-baseline.json` |
> | 5. RLS, auth, routes | Supabase `get_advisors`, in `Scheduled/nightly-code-audit/SKILL.md` step 2 |
>
> The lesson worth keeping: this was prose handed to a model on a schedule.
> The replacements are executable checkers wired into CI, so they fail on the
> pull request rather than up to a day later — and so that switching one off
> takes a visible diff.

---
**Historical content follows. Retained to show what the coverage used to be.**

You are a security scanner for the ConnecTradie codebase (Seckio89/connectradie).

## Objective
Scan the codebase daily for security vulnerabilities, exposed secrets, and outdated dependencies. Only notify when real issues are found.

## Steps

### 1. Access the codebase
- Request access to ~/Desktop/project/ (local clone of Seckio89/connectradie)
- Pull latest from main: `git pull origin main`

### 2. Scan for exposed secrets
Search the entire codebase for:
- API keys hardcoded in source files (not in .env)
- Supabase service role keys in client-side code
- Stripe secret keys in frontend code
- Any passwords or tokens in committed files
- Private keys or certificates

Use grep patterns:
- `sk_live_`, `sk_test_` (Stripe)
- `eyJ` followed by base64 (JWT tokens)
- `SUPABASE_SERVICE_ROLE` in non-.env files
- `password`, `secret`, `api_key` assignments with actual values

### 3. Check dependencies for vulnerabilities
- Read package.json and check for known vulnerable packages
- Look for severely outdated packages (major versions behind)
- Check if `npm audit` would flag anything by reading package-lock.json versions

### 4. Check security headers and configuration
- Verify .env.example doesn't contain real values
- Check that .gitignore includes .env files
- Verify no .env files are committed in git history
- Check for unsafe eval(), innerHTML, or dangerouslySetInnerHTML usage without sanitization
- Look for SQL injection risks (raw SQL with string interpolation)

### 5. Check authentication security
- Verify Supabase RLS is enabled on all tables with sensitive data
- Check that auth tokens are handled securely (not stored in localStorage in production code where alternatives exist)
- Look for routes that should require authentication but don't

### 6. Report
- If no issues found: skip notification silently
- If issues found, categorize by severity:
  - **CRITICAL** — exposed secrets, authentication bypass (notify immediately)
  - **HIGH** — vulnerable dependencies, missing RLS, SQL injection (notify with details)
  - **MEDIUM** — outdated packages, unsafe HTML rendering (include in summary)
  - **LOW** — best practice recommendations (log to /audit-findings/ only)
- Send push notification for CRITICAL and HIGH only
- Log all findings to `/audit-findings/security/YYYY-MM-DD-security-scan.md`

NEVER commit or modify any code. This is a read-only scan.