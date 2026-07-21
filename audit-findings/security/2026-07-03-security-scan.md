# Security Scan — ConnecTradie — 2026-07-03

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` @ `a5c3d87` (Merge PR #23 — assign-team modal dismiss).
**Git pull:** could not run — no git credentials in the automated environment. Scanned the local checkout, which already contains today's merges (PRs #17–#23 present).
**Working tree:** modified files are CRLF/LF-only noise (`git diff --ignore-cr-at-eol` is empty) — no content changes.
**Notification status:** **2 HIGH findings (both carried over, unchanged)** — per task rules a push notification is warranted, but no push/notify tool is available in this automated run. Flagged here for follow-up.

## Summary

**No new issues since the 2026-07-02 scan.** Both HIGH findings from yesterday remain open and unchanged — the seven PRs merged since (#17–#23) were all mobile UI fixes and touched neither `send-email` nor dependencies. All previously-clean areas re-verified clean.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH     | 2 | carried from 2026-07-02, unchanged |
| MEDIUM   | 3 groups | carried, unchanged |
| LOW      | 2 | carried, unchanged |

## Changes since last run (2026-07-02)

- **No security-relevant code changes.** Commits since `4d4dd07`: PRs #17–#23, all mobile UI/CSS fixes (modal dismiss, bottom-nav, calendar modal, row overlap, bell badge, button overflow, alignment). None touch edge functions, auth, dependencies, or migrations.
- **HIGH #1 (send-email open relay) — still open.** Re-verified today: the anon-key-trust block (`isAnonKey` → skip user validation, lines ~398–403) and the spoofable `to` fallback (`recipientEmail = to.trim()`, line ~434) are both still present in `supabase/functions/send-email/index.ts`.
- **HIGH #2 (dependency vulnerabilities) — still open.** `npm audit --omit=dev` re-run today: **6 vulnerabilities (1 critical, 1 high, 4 moderate)** — identical to yesterday. `package-lock.json` unchanged since Jun 13.
- **Supabase live advisors — unchanged.** 16 WARN-level SECURITY DEFINER lints (3 anon-callable, 13 authenticated-callable), same set as prior run. **Zero ERROR-level advisors** — no RLS-disabled tables exposed.

---

## HIGH #1 (carried) — `send-email` is an authenticated open email relay

**File:** `supabase/functions/send-email/index.ts`. Full analysis in the 2026-07-02 report; both weaknesses re-confirmed in today's source:

1. Bearer token equal to the **public anon key** is trusted and skips user validation entirely — the anon key ships in the browser bundle, so this is unauthenticated in practice.
2. `recipientUserId` (non-spoofable server-side lookup) remains **optional**; omitting it falls back to caller-supplied `to.trim()` with no allow-list, so arbitrary recipients are still reachable.

Combined with caller-controlled subject/body and an any-https CTA link, this permits phishing from `notifications@connectradie.com`. Remediation (unchanged): stop trusting the anon key (use service-role or a dedicated secret for cron), make `recipientUserId` mandatory, drop the `to` fallback, restrict `metadata.link` to app origins. The same anon-key-trust pattern also remains in `generate-recurring-sessions`, `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`.

## HIGH #2 (carried) — Vulnerable dependencies: 6 (1 critical, 1 high, 4 moderate)

`npm audit --omit=dev`, re-run 2026-07-03 — identical to yesterday:

| Package | Locked | Severity | Reaches |
|---------|--------|----------|---------|
| `jspdf` | 4.2.0 | **Critical** | via `html2pdf.js` — invoice/receipt PDF generation |
| `ws` | 8.18.3 | **High** | via `@supabase/supabase-js` realtime |
| `dompurify` | 3.3.2 | Moderate | sanitizer the PDF path relies on |
| `react-router` / `react-router-dom` | 6.30.3 | Moderate | open redirect via `//` path |
| `tar` | 7.5.11 | Moderate | build-time only (`@capacitor/cli`) |

Remediation unchanged: `npm audit fix` for most; `jspdf`/`dompurify` likely need a `package.json` `overrides` block since `html2pdf.js` 0.14.0 has no newer release; add `npm audit` to CI.

## MEDIUM (all carried, unchanged)

1. **16 SECURITY DEFINER functions executable by `anon`/`authenticated`** (advisor lints 0028/0029, WARN, EXTERNAL). Anon-callable: `get_daily_profile_view_count`, `has_user_engagement`, `search_businesses_by_name`. Authenticated-callable includes `delete_user_account`, `employer_approve_member`/`_decline_member`/`_remove_member`, `create_notification`, `is_admin`, etc. Each must enforce internal authorization; review and revoke `EXECUTE` where not intended.
2. **`send-sms` recipient caller-controlled.** Re-verified today: requires a real user JWT (better than send-email) but `to` phone number still comes from the request body with no ownership check (`index.ts:79`).
3. **Moderate dependency CVEs** — see HIGH #2 table.

## LOW (carried)

1. Test fixture token string in `src/__tests__/setup.ts:18` — test-only, no action.
2. Key-shaped placeholders in `.env.example` / `STRIPE_SETUP.md` — documentation, no action.

## Re-confirmed clean (re-scanned today)

- **Exposed secrets:** no live `sk_live_`/`sk_test_`/`whsec_` values, no JWTs, no hardcoded password/secret/api_key assignments in `src/`, `supabase/`, config files. Only placeholders in `.env.example`/`STRIPE_SETUP.md`.
- **.env handling:** `.env` gitignored, not tracked, absent from git history (only `.env.example` ever committed — verified via `git log --diff-filter=A`).
- **Service role key:** zero occurrences in client `src/`; edge functions read it via `Deno.env.get` only.
- **RLS:** 69/69 tables created in migrations have explicit `ENABLE ROW LEVEL SECURITY`. No ERROR-level live advisors.
- **SQL injection:** no raw SQL string interpolation; all DB access via query builder / parameterized RPC.
- **Unsafe DOM:** no `eval`/`new Function`/`dangerouslySetInnerHTML`; no new raw `innerHTML` sinks.
- **Auth-token storage:** no auth tokens in `localStorage` (UI prefs only).
- **Stripe webhook:** signature verified via `constructEventAsync`; missing-signature requests rejected 400.
- **Payment edge functions** (`release-escrow`, `process-refund`, `pay-milestone`): Authorization header required, user validated via `auth.getUser`.

## Scan coverage & method

Local checkout scanned at `master@a5c3d87` (git pull unavailable — no credentials; checkout already current). Secret grep across source/config (excluding `node_modules`, `dist`, archives, lockfile). `npm audit --omit=dev` executed. Live Supabase security advisors queried (project `uoqygmizupdpanplpvor`, read-only). Edge-function auth models spot-checked; migrations analysed for RLS coverage.

*Read-only scan. No files modified, staged, committed, or pushed other than this findings log.*
