# Security Scan — ConnecTradie — 2026-07-15

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `e63413a` (feat(help): contextual help system for new users). Working tree scanned as-is (dirty — see note).
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree, **4 commits ahead** of the last scan's HEAD `0ebb61f`.
**Notification status:** **1 HIGH finding present** (vulnerable production dependencies, incl. 1 CRITICAL CVE). Push warranted per task rules, but no push/notify tool is available in this automated run — flagged here for follow-up. No new CRITICAL/HIGH since last run.

## Summary

No exposed credentials, no `.env` leakage, no hardcoded Stripe/Supabase secrets, no app-auth JWTs in source, no `eval`, no `dangerouslySetInnerHTML`, and no SQL injection via string interpolation. `.env` is git-ignored, untracked, and absent from history; `.env.example` holds placeholders only. RLS coverage remains complete: **73 distinct tables** created across migrations, **all 73 with `ENABLE ROW LEVEL SECURITY`** (492 policies) — zero tables without RLS. The Stripe webhook validates signatures (`constructEventAsync`). Edge functions read the service-role key from env only.

Security posture is **unchanged** since 2026-07-14. The one HIGH (vulnerable production dependency set, containing 1 CRITICAL CVE) and one MEDIUM (cron/reminder endpoints trusting the public anon key) are both carried and unremediated. The 4 commits since the last scanned HEAD are a contextual help system, a dual payment mode (Stripe or external per client), an invoice-email redesign, and a Stripe go-live checklist doc — no security regressions, no new secrets, no new injection surfaces.

| Severity | Count | Change since 2026-07-14 |
|----------|-------|--------------------------|
| CRITICAL | 0 standalone (1 CRITICAL CVE inside the HIGH dep finding) | — |
| HIGH     | 1 (vulnerable deps, carried) | unchanged |
| MEDIUM   | 1 (cron anon-key trust, carried) | unchanged |
| LOW      | 2 (offscreen `innerHTML` in PDF/print paths; 3rd-party geo-license JWT committed in `android` strings.xml) | unchanged |

## Changes since last run (2026-07-14)

- **No new secrets, no RLS gaps, no new injection surfaces, no new dependency versions.**
- **4 new commits** (`0ebb61f..e63413a`): `feat(help)` contextual help system, `feat(payments)` dual payment mode (Stripe or external per client), `feat(email)` off-app invoice email redesign, `docs` Stripe test→live go-live checklist. Reviewed for secret leakage — clean. Note the go-live checklist commit concerns swapping Stripe test keys for live keys: **no live `sk_`/`whsec_` values are present in source or `.env.example`** (they belong in the deployment env only), which is correct.
- **HIGH (deps) unchanged** — `npm audit --omit=dev` still reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate.** Identical set to prior runs. No `npm audit fix` has been run. (Full tree incl. dev deps: **18** — 2 critical, 5 high, 9 moderate, 2 low.)
- **MEDIUM (cron anon-key) unchanged** — `generate-recurring-sessions:87`, `send-invoice-reminders:55`, `send-lead-reminders:58`, `send-recurring-reminders:56` all still authorize with `token === supabaseServiceKey || token === supabaseAnonKey`.
- **Working tree is dirty (140 changed paths)** — the bulk is whitespace / line-ending normalization across `src/components` and `src/pages` (no logic change), plus the help-system and payment-mode work. No packages added, removed, or bumped (`package.json`/`package-lock.json` diffs are version-stable), so the dependency audit result is unchanged. No secrets or new risky patterns introduced.

## Detailed findings

### CRITICAL — none standalone

### HIGH — Vulnerable production dependencies (carried, unremediated)

`npm audit --omit=dev` against the committed lockfile reports 6 production vulnerabilities. Named packages, all with fixes available:

- **`jspdf` `<=4.2.0` — CRITICAL.** PDF Object Injection / HTML injection in the "new window" path. Used in invoice/receipt PDF export. Fix available.
- **`ws` `8.0.0 – 8.20.1` — HIGH.** Uninitialized memory disclosure; DoS from many tiny fragments. Fix available.
- **`dompurify` `<=3.4.10` — MODERATE.** `FORBID_TAGS` bypass via function-based `ADD_TAGS` predicate. Fix available.
- **`react-router` / `react-router-dom` `6.6.3 – 6.30.3` — MODERATE.** Open redirect via protocol-relative same-origin redirect reinterpretation. Fix available.
- **`tar` `<=7.5.15` — MODERATE.** PAX size-override parser differential enabling file smuggling. Fix available.

**Recommended action:** run `npm audit fix` (review `jspdf` and `react-router-dom` majors/minors for breaking changes) in a supervised session, then rebuild and re-run the test suite. Priority: `jspdf` (critical) and `ws` (high).

### MEDIUM — Cron/reminder edge functions trust the public anon key (carried)

Four scheduled endpoints authorize a caller when the bearer token equals **either** the service-role key **or** the public anon key:

- `supabase/functions/generate-recurring-sessions/index.ts:87`
- `supabase/functions/send-invoice-reminders/index.ts:55`
- `supabase/functions/send-lead-reminders/index.ts:58`
- `supabase/functions/send-recurring-reminders/index.ts:56`

The anon key ships to every browser client, so anyone can invoke these bulk-generation / bulk-email jobs. Impact is bounded (they generate scheduled records and send templated reminders, not money movement), but they are abusable for spam/DoS and cost. **Recommended:** gate on the service-role key or a dedicated cron secret only; drop the anon-key branch.

### LOW

- **Offscreen `innerHTML` in PDF/print paths.** `src/components/InvoiceViewModal.tsx:172` builds print markup from React-rendered (already-escaped) DOM into an off-screen container. `src/pages/Payouts.tsx:642` assigns `finalHtml` to an off-screen container; the custom-template branch explicitly validates the src (`data:image/*` or `https:` only) and HTML-escapes before interpolation. Low risk; keep the escaping intact on future edits.
- **Third-party geo-license JWT committed in Android resources.** `android/app/src/main/res/values/strings.xml` contains `transistor_bg_geo_license` — a Transistorsoft background-geolocation product license (JWT-shaped), bound to `app_id com.connectradie.app`. It is a paid-SDK entitlement token intended to ship inside the app binary, **not** a credential to ConnecTradie data or infrastructure. Informational only.

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `scripts/`, `index.html`, and root config (excluded `node_modules`, `dist`, the `connectradie.tar.gz`/`.zip` archives, `package-lock`). Patterns: `sk_live_`/`sk_test_`, `whsec_`, `rk_`, `AIza…` Google keys, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`/`service_role` in client code, and `password`/`secret`/`api_key`/`token` literal assignments. Clean.
- `.gitignore`, git tracking, and git history checked for `.env` — clean (`.env` ignored & untracked; only `.env.example` tracked, placeholders only).
- Code-safety scan: `eval(` (none), `dangerouslySetInnerHTML` (none), `.innerHTML =` (2 offscreen PDF/print uses, reviewed — LOW), SQL string interpolation in edge functions (none; the single `.rpc` call uses parameterized args).
- Migrations analysed for RLS coverage — 73 distinct tables created (74 `CREATE TABLE` statements incl. one duplicate `stripe_orders IF NOT EXISTS` across two migrations), each matched to an `ENABLE ROW LEVEL SECURITY`; 492 `CREATE POLICY` statements. Zero gaps.
- Edge functions reviewed for auth model, webhook signature validation (`stripe-webhook/index.ts:47` validates), and service-role handling (env-only).
- `npm audit` (full + `--omit=dev`) run against the committed lockfile (no network install).
- Working-tree diff reviewed vs last-scan HEAD `0ebb61f` (4 commits) and for uncommitted changes.
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); `git pull` (no credentials).

---
*Automated read-only scan. No code or configuration was modified.*
