# Security Scan — ConnecTradie — 2026-07-14

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch:** `master` @ `0ebb61f` (fix(calendar-import): selective import — nothing ticked by default). Working tree scanned as-is (dirty — see note below).
**Git pull:** could not run — no git credentials in the automated environment (`could not read Username for 'https://github.com'`). Scanned the current local working tree, which is **14 commits ahead** of the last scan's HEAD `788de69`.
**Notification status:** **1 HIGH finding present** (vulnerable production dependencies, incl. 1 CRITICAL CVE). Push warranted per task rules, but no push/notify tool is available in this automated run — flagged here for follow-up.

## Summary

No exposed credentials, no `.env` leakage, no hardcoded Stripe/Supabase secrets, no app-auth JWTs in source, no `eval`, no `dangerouslySetInnerHTML`, and no SQL injection via string interpolation. `.env` is git-ignored, untracked, and absent from history; `.env.example` holds placeholders only. RLS coverage remains complete: **73 distinct tables** created across local migrations, **all 73 with `ENABLE ROW LEVEL SECURITY`** (493 policies) — zero tables without RLS. The Stripe webhook validates signatures (`constructEventAsync`). Edge functions read the service-role key from env only (76 references, all `Deno.env.get`).

Security posture is **unchanged** since 2026-07-13. The one HIGH (vulnerable production dependency set, containing 1 CRITICAL CVE) and one MEDIUM (cron/reminder endpoints trusting the public anon key) are both carried and unremediated. The 14 commits since the last scanned HEAD are calendar-import, mobile UI, payouts, and docs work — no security regressions, no new secrets, no new injection surfaces.

| Severity | Count | Change since 2026-07-13 |
|----------|-------|--------------------------|
| CRITICAL | 0 standalone (1 CRITICAL CVE inside the HIGH dep finding) | — |
| HIGH     | 1 (vulnerable deps, carried) | unchanged |
| MEDIUM   | 1 (cron anon-key trust, carried) | unchanged |
| LOW      | 2 (offscreen `innerHTML` in PDF/print paths; 3rd-party geo-license JWT committed in `android` strings.xml) | unchanged |

## Changes since last run (2026-07-13)

- **No new secrets, no RLS gaps, no new injection surfaces, no new dependency versions.**
- **HIGH (deps) unchanged** — `npm audit --omit=dev` still reports **6 production vulnerabilities: 1 critical, 1 high, 4 moderate.** Identical set to prior runs. No `npm audit fix` has been run. (Full tree incl. dev deps: **18** — 2 critical, 5 high, 9 moderate, 2 low.)
- **MEDIUM (cron anon-key) unchanged** — `generate-recurring-sessions:87`, `send-invoice-reminders:55`, `send-lead-reminders:58`, `send-recurring-reminders:56` all still authorize with `token === supabaseServiceKey || token === supabaseAnonKey`.
- **Working tree is dirty** — `package.json` and `package-lock.json` show modifications, but the diff is **whitespace / line-ending normalization only**: every dependency line appears as both `+` and `-` at the *same version*. No packages added, removed, or bumped — dependency audit result is stable. Other modified files (`android/*`, `capacitor.config.ts`, `public/service-worker.js`, `scripts/*.mjs`) contain no secrets and no new risky patterns.

## Detailed findings

### CRITICAL — none standalone

### HIGH — Vulnerable production dependencies (carried, unremediated)

`npm audit --omit=dev` against the committed lockfile reports 6 production vulnerabilities. Named packages, all with fixes available:

- **`jspdf` `<=4.2.0` — CRITICAL.** PDF Object Injection via FreeText color; HTML Injection in "new window" paths. Used in the invoice/receipt PDF export paths. Fix available.
- **`ws` `8.0.0 – 8.20.1` — HIGH.** Uninitialized memory disclosure; memory-exhaustion DoS from tiny fragments. Fix available.
- **`dompurify` `<=3.4.10` — MODERATE.** `FORBID_TAGS` bypass via function-based `ADD_TAGS` predicate. Fix available.
- **`react-router` / `react-router-dom` `6.6.3 – 6.30.3` — MODERATE.** Open redirect via protocol-relative (`//`) same-origin redirect reinterpretation. Fix available.
- **`tar` `<=7.5.15` — MODERATE.** PAX size-override parser differential enabling file smuggling. Fix available.

**Recommended action:** run `npm audit fix` (and review the `jspdf` and `react-router-dom` majors/minors for breaking changes) in a supervised session, then rebuild and re-run the test suite. Priority is `jspdf` (critical) and `ws` (high).

### MEDIUM — Cron/reminder edge functions trust the public anon key (carried)

Four scheduled endpoints authorize a caller when the bearer token equals **either** the service-role key **or** the public anon key:

- `supabase/functions/generate-recurring-sessions/index.ts:87`
- `supabase/functions/send-invoice-reminders/index.ts:55`
- `supabase/functions/send-lead-reminders/index.ts:58`
- `supabase/functions/send-recurring-reminders/index.ts:56`

The anon key is shipped to every browser client, so anyone can invoke these bulk-generation / bulk-email jobs. Impact is bounded (they generate scheduled records and send templated reminders, not money movement), but they are abusable for spam/DoS and cost. **Recommended:** gate these on the service-role key or a dedicated cron secret only; drop the anon-key branch.

### LOW

- **Offscreen `innerHTML` in PDF/print paths.** `src/components/InvoiceViewModal.tsx:172` builds print markup from `printRef.current.innerHTML` (React-rendered, already escaped DOM) into an off-screen container. `src/pages/Payouts.tsx:596` assigns `finalHtml` to an off-screen container, but the custom-template branch **explicitly validates** the src (`data:image/*` or `https:` only) and HTML-escapes it before interpolation. Low risk; no action required, but keep the escaping intact on future edits.
- **Third-party geo-license JWT committed in Android resources.** `android/app/src/main/res/values/strings.xml` contains `transistor_bg_geo_license` — a Transistorsoft background-geolocation **product license** (JWT-shaped), bound to `app_id com.connectradie.app`. It is a paid SDK entitlement token, **not** a credential to ConnecTradie user data or infrastructure, and it is intended to ship inside the app binary. Informational only; no exposure of platform secrets.

## Scan coverage & method

- Secret scan across `src/`, `supabase/`, `e2e/`, `index.html`, and root config (excluded `node_modules`, `dist`, the `connectradie.tar.gz`/`.zip` archives, and `package-lock`). Patterns: `sk_live_`/`sk_test_`, `whsec_`, `rk_`, `eyJ…` JWTs, `SUPABASE_SERVICE_ROLE`/`service_role` in client code, and `password`/`secret`/`api_key`/`token` literal assignments. Clean.
- `.gitignore`, git tracking, and git history checked for `.env` — clean (`.env` ignored & untracked; only `.env.example` tracked, placeholders only, no real `sk_`/`whsec_`/JWT values).
- Code-safety scan: `eval(` (none), `dangerouslySetInnerHTML` (none), `.innerHTML =` (2 offscreen PDF/print uses, reviewed — LOW), SQL string interpolation in edge functions (none; single `.rpc` call uses parameterized args).
- Local migrations analysed for RLS coverage — 73 `CREATE TABLE` names, each matched to an `ENABLE ROW LEVEL SECURITY`; 493 `CREATE POLICY` statements. Zero gaps.
- Edge functions reviewed for auth model, webhook signature validation (`stripe-webhook/index.ts:47` validates), and service-role handling (env-only).
- `npm audit` (full + `--omit=dev`) run against the committed lockfile (no network install).
- Working-tree diff reviewed vs last-scan HEAD `788de69` (14 commits) and for uncommitted changes.
- **Not performed:** live Supabase advisor query (no DB session in this unattended run); `git pull` (no credentials).

---
*Automated read-only scan. No code or configuration was modified.*
