# Security Scan — ConnecTradie — 2026-07-20

**Run mode:** automated (unattended, read-only). **Repo:** Seckio89/connectradie. **Working copy:** `~/Desktop/project`.
**Branch scanned:** `master` (note: `git pull origin main` fails — the default branch is `master`, not `main`; pulled `master` instead → already up to date).
**HEAD:** `f89dbe0 security(db): revoke PUBLIC EXECUTE on pay-enforcement trigger fns`.
**Notification sent:** No — no CRITICAL or HIGH findings this run.

## Summary

Clean run with two positive changes since 2026-07-19:

1. **Yesterday's HIGH (vulnerable dependencies) is resolved.** A live `npm audit` today reports **0 vulnerabilities** (exit 0, online). `package.json` now pins `jspdf@4.2.1` and `dompurify@3.4.12` via `overrides`, and the lockfile resolves the previously-flagged packages to patched versions: `jspdf 4.2.1`, `dompurify 3.4.12`, `vite 7.3.6`, `vitest 4.1.10`, `react-router-dom 6.30.4`, `postcss 8.5.20`.
2. **Anon-executable `SECURITY DEFINER` functions dropped from 9 to 5.** Today's HEAD commit revoked `PUBLIC EXECUTE` on the pay-enforcement trigger functions, clearing the four trigger-function items flagged in prior runs.

No exposed secrets, no auth bypass, no SQL injection, no missing RLS. One **new MEDIUM** this run: a PostgREST `.or()` filter-injection path via an unsanitized, user-controlled job-description field.

| Severity | Count | Notes |
|----------|-------|-------|
| CRITICAL | 0 | No exposed secrets / auth bypass |
| HIGH     | 0 | Dependency vulns from 2026-07-19 now resolved (`npm audit` = 0) |
| MEDIUM   | 2 | (1) 5 anon-executable definer functions; (2) PostgREST `.or()` filter injection |
| LOW      | 5 | 23 authenticated definer fns; hardcoded public anon key; geofence token in localStorage; estimate-quote limit fails-open; OAuth state HMAC key reuse |

## Scan coverage & method

- **Git:** default branch is `master`; `git pull origin master` → already up to date at `f89dbe0`. (The task's `git pull origin main` returns `couldn't find remote ref main`.)
- **Secret scan** across all 771 git-tracked files (excluded `node_modules`, `dist`, `*.zip`/`*.tar.gz` archives, `package-lock.json`, binary assets).
- **Dependencies:** live `npm audit` — ran successfully online, **0 vulnerabilities**. Lockfile versions cross-checked against the overrides.
- **Migrations:** every `CREATE TABLE` (83) has a matching `ENABLE ROW LEVEL SECURITY` (83) — 0 tables missing RLS.
- **Live Supabase security advisors** queried (project `uoqygmizupdpanplpvor`, read-only): **0 ERROR-level lints**; only the WARN-level definer-function items below.

---

## CRITICAL — none

- **Secrets:** No `sk_live_`/`sk_test_`/`rk_live_` Stripe secret keys, no `whsec_` webhook secrets, no PEM private keys, no hardcoded password/token assignments in tracked source. `src/` contains **no** `service_role` or Stripe-secret usage (all such keys live in edge functions via `Deno.env.get(...)`).
- The only two JWTs in tracked source are both public-by-design and documented as such: the Supabase **anon-role** key in `api/quote-og.ts` (ships in the web bundle), and the package-bound **Transistorsoft background-geolocation license** key in `android/.../strings.xml`.
- **`.env` handling:** `.env` is gitignored, untracked, and never appears in git history. `.env.example` holds placeholders only. `.npmrc` contains only `legacy-peer-deps=true` (no registry token). CI (`.github/workflows/ci.yml`) uses `${{ secrets.* }}`, no inline secrets.
- No authentication bypass identified.

## HIGH — none

Live `npm audit` reports **0 vulnerabilities** (was 18 on 2026-07-19). The production-impacting `jspdf` CRITICAL and `dompurify` moderate are cleared by the new `overrides`; dev-tooling items (Vite, Vitest, undici, ws) are resolved by the current lockfile versions. **Recommendation:** keep the `overrides` block until `html2pdf.js` ships a release that depends on a patched `jspdf` directly, then remove the pin.

## MEDIUM

**M1 — 5 `SECURITY DEFINER` functions executable by the `anon` (unauthenticated) role** (advisor lint `0028`, down from 9):
`get_daily_profile_view_count`, `get_service_worker_details`, `get_team_site_activity`, `has_user_engagement`, `search_businesses_by_name`. These run with definer privileges and are reachable via `/rest/v1/rpc/…` without signing in. `search_businesses_by_name` / `get_daily_profile_view_count` may be intentionally public (business search, view counting), but `get_service_worker_details` and `get_team_site_activity` return operational data and should not be anon-callable. **Action:** `REVOKE EXECUTE … FROM anon` on the non-public ones, or switch to `SECURITY INVOKER`; for any that must stay public, confirm they enforce their own row-level checks. Then `supabase db push`.
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

**M2 — PostgREST `.or()` filter injection via unsanitized user input** — `src/lib/notifications.ts:201`:
```
.or(`trade_category.ilike.${profession},trade_category.ilike.${rawCategory},trade_category.ilike.%${rawCategory}%`)
```
`rawCategory` comes from `extractCategory(job.description)`, which returns whatever a homeowner types inside a leading `[...]` bracket in the job description (regex `/^\[([^\]]+)\]/`, no character filtering). A crafted description (e.g. `[x,trade_category.not.is.null...]`) can inject additional PostgREST filter conditions into the `.or()` string. Impact is bounded by RLS on `tradie_details` (an attacker cannot read rows RLS forbids), but it can subvert the intended category-matching logic and broaden which tradies are queried/notified. **Action:** whitelist `rawCategory` against the known trade-category list (as `categoryToProfession` already does), or strip PostgREST metacharacters (`,`, `(`, `)`, `.`, `*`, `:`) before interpolation. Prefer `.in('trade_category', [...])` over string-built `.or()`.
*Note:* other `.or()` interpolations reviewed (`Messages.tsx`, `ClientDetail.tsx`, `SmartInsightsWidget.tsx`, `PlatformUpdateBanner.tsx`, `check-license-expiry`, `reconcile-payments`) all interpolate system-generated values (auth `uid`, ISO timestamps) — not user-controlled — so they are not injectable, though the pattern is fragile and would benefit from a shared filter-builder helper.

## LOW

1. **23 `SECURITY DEFINER` functions executable by `authenticated`** (advisor lint `0029`), e.g. `delete_user_account`, `employer_*_member`, `create_notification`, `is_admin`, `can_read_job_attachment`. All require a signed-in session and are generally intended; each should still authorise the specific caller (`auth.uid()`) internally rather than relying on definer rights alone. Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
2. **Public anon key hardcoded in `api/quote-og.ts:22`.** Public by design (same key ships in the web bundle), documented with a comment — not a leak, but sourcing from an env var would ease key rotation.
3. **Geofence device token in `localStorage`** (`src/lib/siteGeofence.ts`). An opaque random UUID bound to the tradie and stored server-side in `device_geofence_tokens`; used to authenticate background geolocation POSTs after the JWT expires. It is a long-lived bearer token exposed to any XSS, but scoped only to geofence check-ins (not the auth session). Acceptable design; low impact.
4. **`estimate-quote` usage-limit check fails open** (`supabase/functions/estimate-quote/index.ts:437`). If the limit lookup errors, the request is allowed through (`failing open`). On a public (verify_jwt=false) endpoint that uses the service-role key and calls an LLM (`max_tokens: 6000`), a forced-error path could enable cost-abuse. The endpoint does enforce a CORS allowlist and a `Bearer` header, which limits exposure. Consider failing closed on limit-check errors.
5. **OAuth state HMAC key reuse** (`supabase/functions/google-calendar-oauth/index.ts:39`). The signed-state HMAC falls back to `SUPABASE_SERVICE_ROLE_KEY` when `OAUTH_STATE_SECRET` is unset. State signing/verification is otherwise correct (constant-time verify, 10-min TTL). Provision a dedicated `OAUTH_STATE_SECRET` so the service-role key isn't reused as signing material.

## Unsafe-HTML / injection review (no finding)

- No `dangerouslySetInnerHTML`, no `eval()`, no `new Function()` in `src/` / `api/` / edge functions.
- Three `innerHTML` sinks — `src/components/InvoiceViewModal.tsx:172`, `src/pages/JobTracking.tsx:123`, `src/pages/Payouts.tsx:709` — all build offscreen PDF/print markup. `JobTracking` and `Payouts` pass every dynamic field through the shared `escapeHtml` util (`src/lib/escapeHtml.ts`); `Payouts` additionally validates the custom-template `src` (`data:image/*;base64` or `https:` only) and attribute-escapes it; `InvoiceViewModal` re-serializes already React-rendered (escaped) DOM. No injection path.
- No raw string-interpolated SQL in edge functions — Supabase query builder / parameterised `rpc()` used throughout.

## RLS / auth (no finding)

- Every table created across 279 migrations (83 distinct tables) has `ENABLE ROW LEVEL SECURITY` — 0 missing.
- Live Supabase advisors: **0 ERROR-level** security lints; only WARN-level definer-function items (see M1 / LOW #1).
- Route protection present client-side via `ProtectedRoute` (role guards: admin / tradie / client / onboarding) in `src/App.tsx`.
- Stripe webhook validates signatures (`stripe.webhooks.constructEventAsync` with `STRIPE_WEBHOOK_SECRET`) — hard-rule compliant.
- Only 3 edge functions run `verify_jwt = false` (`stripe-webhook`, `google-calendar-oauth`, `estimate-quote`); each implements its own auth (signature check / HMAC-signed state / CORS + Bearer + usage limit).

---

*Generated by the automated security-scanner scheduled task. Read-only — no code or database changes were made.*
