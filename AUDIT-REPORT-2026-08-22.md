# Platform Audit Report — 2026-08-22

Full 7-dimension audit of `master` at `af884e6`, run at the owner's request with
**live production verification** and an **adversarial money-path deep-hunt** on
top of the standard checklist. Baseline for comparison is the 08-03 nightly
(94.3%). 83 commits have landed since 08-01 (58 since 08-03); the fleet is now
**76 edge functions** (77 deployed — see the orphan finding) and **353**
migration files.

## Read this first

This audit scores **74% 🔴**, against 94.3% 🟢 three weeks ago. **Nothing
regressed.** Several things improved (lint backlog cleared, double-title
resolved, escrow copy fixed). The drop is entirely because this cycle did two
things the nightly checklist structurally cannot: it read **every one of the 76
edge functions end to end** and ran **adversarial finders across the money
paths**, and that surfaced pre-existing HIGH integrity gaps the surface-level
checklist scored as passing. The 94.3% and the 74% are measuring the same code
at different depths. The money paths need work before this reads as
production-solid — that is the headline.

Scoring note: this cycle credits a **partially-passing check at 0.5** rather
than the nightly's binary pass/fail, so absolute numbers are not directly
comparable to the trend line. The direction and the findings are what matter.

## Summary

| Dimension | Score | Weight | Contribution | Status | vs 08-03 |
|-----------|-------|--------|--------------|--------|----------|
| Security & Auth | 79% | 25% | 19.8% | 🟡 | ▼ 100 |
| Payments & Stripe | 68% | 25% | 17.0% | 🔴 | ▼ 100 |
| Database & RLS | 90% | 20% | 18.0% | 🟢 | ▼ 92.9 |
| TypeScript Safety | 79% | 10% | 7.9% | 🟡 | ▼ 100 |
| UI & Design System | 50% | 5% | 2.5% | 🔴 | ▼ 71.4 |
| Navigation | 86% | 5% | 4.3% | 🟡 | ▼ 100 |
| Test Coverage | 50% | 10% | 5.0% | 🔴 | ▼ 71.4 |
| **Overall** | **74%** | | | 🔴 | ▼ 94.3 |

Every downward move is a deeper-look finding, not a code change since 08-03.

## What was actually run

| Instrument | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run typecheck:edge` | ✅ 76/76 pass |
| `npm run test:run` | ✅ 40 files, **1027 tests** pass (was 958/33) |
| `npm run lint` | ✅ **0 errors**, 54 warnings — **closes #21** (bbe2b4d) |
| `check:columns` · `check:migrations` · `check:cron-auth` | ✅ clean |
| `check:nav:ci` · `check:ink` · `check:tokens` · `check:edge-docs` | ✅ clean, 0 new vs baseline |
| `check:secrets` · `check:sinks` | ✅ clean |
| `check:edge-drift` | ✅ 27/27 deployed money functions match `origin/master` |
| `check:deps` | ⚠️ **broken** — reports "no output" while `npm audit` shows **2 moderate** |
| `check:drift` · `check:ledger` | ⚠️ skipped (no `SUPABASE_ACCESS_TOKEN`) — carried #31 |
| `check:contrast` | ⚠️ 33 surfaces measured, **0 AA failures**; 18 app routes redirect to /login unmeasured — carried #32 |
| Live prod (read-only): RLS state, advisors, HTTP probes, logs | ✅ run — see Live verification |

The **top HIGH findings below were each re-verified by reading the source
directly**, not only reported by an agent — the money and auth claims in this
report are source-confirmed.

## The headline findings

Eight HIGH money/auth defects, all source-verified. These are the reason
Payments and Security dropped.

### Money integrity

1. **`release-escrow` never checks `disputes.blocks_release`.** The
   client-initiated release path contains zero references to the disputes table
   (grep-confirmed). The ratified policy makes `blocks_release` the *only*
   payout-freeze decider — but only the `auto-release-payments` cron consults
   it. **A cardholder can raise a bank chargeback (which writes a blocking
   disputes row precisely to freeze payout) and then immediately click Approve &
   Release; the tradie's balance pays out, the reversal lands on an empty
   balance, and the platform is liable.** `release-escrow/index.ts`.

2. **`verify-payment` will mark any invoice paid with an unrelated cheap
   session.** The session-to-invoice binding check runs only `if
   (invoice.stripe_checkout_session_id)`; invoices with a NULL stored session id
   (BECS and most recurring) accept **any** caller-supplied paid session, with
   **no amount comparison**. A homeowner takes the session id from a $4.99
   estimate-pack purchase and marks an arbitrarily large invoice of theirs
   `paid`. The tradie sees a paid invoice and never receives the money.
   `verify-payment/index.ts:102`.

3. **`create-job-deposit` trusts the deposit amount from the client.** `amount`
   is taken from the body with only `typeof === "number" && > 0`; it is never
   compared to the quote or budget, then charged as the `job_funding` escrow row
   that flips the job to `in_progress`. A client funds a job with **$1**, the
   job auto-starts, and the tradie works against near-empty escrow.
   `create-job-deposit/index.ts:87`. (Severity depends on whether partial
   deposits are intended — flag for the owner.)

4. **`pay-milestone` can charge the same milestone repeatedly.** A milestone is
   payable while `status='approved'`, and nothing anywhere flips it out of
   `approved` after payment (grep-confirmed) — plus there is no existing-payment
   dedupe. A double-click or a retried request charges the client twice for one
   milestone; both land as `job_funding` and both get released.
   `pay-milestone/index.ts:103`.

5. **`charge-becs-invoice` can double-debit a bank account.** No invoice-status
   guard before initiating a real BECS direct debit; the only protection is a
   Stripe idempotency key that expires ~24h. A permitted caller re-invoking >24h
   later initiates a second real debit on an already-paid invoice. BECS
   reversals are manual and take days. `charge-becs-invoice/index.ts:88`.

6. **`create-job-payment-checkout` frozen-fee update is unchecked.** The
   post-session update that writes the frozen `platform_fee` is not error-checked;
   the code's own comment states the consequence — release-escrow reads the fee
   with a `typeof === "number"` guard and **pays out the full amount** if it is
   absent. A silent DB failure means the client pays, the tradie is paid in full,
   and the platform loses its commission. `create-job-payment-checkout/index.ts:305`.

### Authorization

7. **Four cron/service functions accept the public anon key as
   authorization.** `generate-recurring-sessions`, `send-invoice-reminders`,
   `send-lead-reminders` and `send-recurring-reminders` authorize any caller whose
   bearer equals `SUPABASE_ANON_KEY` or whose JWT role is `anon`
   (`generate-recurring-sessions/index.ts:78`, `send-invoice-reminders/index.ts:55`,
   both source-confirmed). The anon key ships in the frontend bundle and is a
   valid signed JWT, so it passes the gateway too. **Any internet caller can
   trigger these service functions** — generating recurring sessions across all
   jobs, advancing due dates, and spamming notification/email batches
   (`send-recurring-reminders` has no idempotency, so each call re-sends). These
   should use `_shared/serviceAuth.hasServiceRole` like their correct siblings.

8. **`send-sms` lets any authenticated user send arbitrary SMS to any number.**
   After a bare `getUser`, `to` and `body` go straight to Twilio with no
   recipient-ownership check; the rate limit is keyed per destination number, so
   rotating numbers bypasses it. This is toll fraud and brand-impersonation
   phishing on the platform's Twilio account — the exact abuse `send-email` was
   locked down for, a mitigation `send-sms` never got. `send-sms/index.ts:68`.

## Evidence by dimension

**Security & Auth — 79% 🟡.** RLS is enabled on all 109 tables (live-verified),
no hardcoded secrets, webhook signatures validate, CORS holds against a hostile
origin, and most functions authenticate correctly. The deductions: the anon-key
auth bypass on four cron functions and the `send-sms` abuse path (check 1 fails);
input validation is partial across the fleet (money amounts accept NaN/Infinity
via `typeof`-only checks, dates/UUIDs unvalidated); rate limiting is partial
(`charge-becs-invoice` has none; `send-sms` is per-destination and bypassable). A
recurring sub-theme: several functions still identify the service role by
byte-comparing the key or decoding an unverified JWT role claim rather than the
`hasServiceRole` capability probe — safe today only because the gateway verifies
signatures, a latent trap if any is ever pinned `verify_jwt=false`.

**Payments & Stripe — 68% 🔴.** The foundations are genuinely solid and pass
outright: escrow is destination-charge only (Stripe holds funds, never the
platform), webhook signatures are validated with an event-id dedupe table, the
fee engine (`resolveChargeFee`) honours `platform_fee_override_bps` server-side,
and AFSL copy consistently attributes custody to Stripe. What fails: the release
path skips `blocks_release` (#1), amounts are client-trusted on the deposit path
(#3), idempotency is missing on checkout-session creation (optional client key),
and there are multiple orphaned-record / double-charge windows (stale sessions
never expired, `pay-milestone` never marked paid, `checkout.session.completed`
has no status filter and can resurrect terminal rows). `RELEASE_WINDOW_HOURS = 5`
is in sync across both files; the ratified auto-release policy itself is correctly
implemented on the cron.

**Database & RLS — 90% 🟢.** 104 tables, RLS enabled on every one; CRUD policies
scoped by `auth.uid()`; no `current_user` in any policy predicate; FK and
composite indexes well covered (the 20260730 backfill closed the last gaps). The
deductions are a permissive-write partial: `client_errors` allows unbounded
anon INSERT (telemetry table, spam/bloat surface), and `tradie_details` is
readable by every authenticated user via `SELECT USING(true)` (the acute PII —
ABN, licence, bank — was already split out to `profile_private`; residual is
subscription/payout fields pending the profiles-RLS project). Two config tables
(`app_settings`, `system_settings`) gate UPDATE on identities no real account
holds (`admin@tradie.com` / `role='admin'`), leaving them service-role-only —
dead admin gates, not a leak. The `notifications` INSERT policy regressed to
`WITH CHECK(true)` across four migrations before its final lockdown — resolved,
but a policy-drift pattern worth noting.

**TypeScript Safety — 79% 🟡.** The hard rules are met: `typecheck` and
`typecheck:edge` both pass 0, and `src/` is free of explicit `any` (grep-clean).
Deductions are quality-layer: four data-heavy pages hand-roll row interfaces
applied via `as unknown as` (70 such double-casts across 36 files) instead of
deriving from `src/types/supabase.ts`, and several read queries (PerformanceInsights,
ChatDrawer, Team) swallow `.error` and render zeros on failure. Known #27
persists and grew — `stripe: any`/`payout: any` in `_shared/instantPayout.ts`
(now :410/:426) plus five `SupabaseLike = any` helpers on money paths; edge
functions get no `typecheck` coverage, so `check:columns` is their only guard.

**UI & Design System — 50% 🔴.** Mechanical checks pass (`check:ink`,
`check:tokens` clean; hex literals only in the documented exemptions). The
judgment layer is where it falls down: the **`font-ct-mono` rule is essentially
unimplemented on every money screen** (0 uses in TradieDashboard, PaymentHistory,
Payouts, Pricing, ClientDashboard, UnlockLeadModal — every dollar figure renders
in Inter), the semantic colour rule is diluted (amber used decoratively in the
booking form and Settings; booked slots rendered in rose = "failed"), nested dim
tints appear in several banners (a contrast risk the design system explicitly
warns against), and three components inject inline `<style>` keyframes outside
the two sanctioned CSS files, none guarded by `prefers-reduced-motion`. Title
Case persists (#13: AnalyticsDashboard, Terms) and #30 (`lead` wording) is still
open; #29 (Pricing escrow heading) is **fixed**.

**Navigation — 86% 🟡.** All routes reachable, role-gating consistent, no
orphans beyond baseline, and #28 (double-title) is **resolved** (SEO.tsx no
longer sets `document.title`; RouteTracker is the sole owner). One real defect:
**two of the four marketing nav links are dead** — `/#for-tradies` and
`/#how-it-works` (in Navbar and Footer) point at element ids that exist nowhere
in `src/`, so they scroll to nothing. Minor: the logged-in "Post a job" navbar
link goes to `/dashboard` not `/post-lead`, and a stale App.tsx comment claims
Workforce has no nav entry.

**Test Coverage — 50% 🔴.** Substance improved (1027 tests across 40 files, up
from 958/33) but the structural gaps remain: **62 of 75 edge functions have no
handler-level test** (the `guards.test.ts` suite covers 12, and notably omits
`auto-release-payments` — the function that releases every escrow on a cron),
and **1 of 65 pages** has a test (none of the five large money/auth files, none
of the payment-display surfaces, neither auth page nor AuthContext). E2E covers
the critical flows well (auth, search, and seed-driven job-lifecycle / dispute /
variation / cancel harnesses), though the default `test:e2e` never asserts a
successful login and the guard suite isn't wired into any npm script.

## Live verification (read-only, production)

- **RLS:** 109/109 public tables have RLS enabled. Every `USING(true)` write
  policy is correctly restricted to `service_role` except `client_errors`
  (reported). Permissive SELECT true only on genuinely public tables (plus
  `tradie_details`, reported).
- **HTTP probes:** `stripe-webhook` unsigned → 400; `release-escrow` /
  `instant-payout` no-auth → 401; `mark-invoice-paid` / `send-email`
  (`verify_jwt=false`) → 401 via in-function guard; hostile-origin preflight to
  `estimate-quote` returns `Access-Control-Allow-Origin: https://connectradie.com`
  (not reflected).
- **Advisors:** 4 `rls_enabled_no_policy` (deny-all service tables — intentional),
  ~32 `authenticated`-executable SECURITY DEFINER RPCs (the ratified pattern;
  `has_user_engagement`/`get_daily_profile_view_count` were the IDOR-oracle cases
  and are already fixed), ~57 unused indexes (#11), 2 multiple-permissive-policies
  (`business_team_members` UPDATE, `payout_sweeps` SELECT), auth pool absolute (#12).
- **Edge fleet:** 77 functions deployed vs 76 in the repo. The orphan is
  **`debug-anthropic`** — a retired stub returning 410, self-commented "safe to
  delete", never removed from the dashboard. `query_logs` shows no recent 5xx.

## All findings (severity-ranked)

| # | Sev | Dimension | File | Finding |
|---|-----|-----------|------|---------|
| 1 | HIGH | Payments | release-escrow | Client release never checks `blocks_release`; chargeback→release→negative balance |
| 2 | HIGH | Payments | verify-payment:102 | Invoice markable paid with an unrelated cheap paid session; no amount check |
| 3 | HIGH | Payments | create-job-deposit:87 | Deposit `amount` trusted from client; fund $1 and auto-start the job |
| 4 | HIGH | Payments | pay-milestone:103 | Milestone never marked paid + no dedupe → repeat charges |
| 5 | HIGH | Payments | charge-becs-invoice:88 | No status guard before BECS debit → double-debit after 24h idempotency window |
| 6 | HIGH | Payments | create-job-payment-checkout:305 | Unchecked frozen-fee write → release pays full amount, platform loses commission |
| 7 | HIGH | Security | generate-recurring-sessions:78 (+3 crons) | Public anon key accepted as authorization on service functions |
| 8 | HIGH | Security | send-sms:68 | Any user sends arbitrary SMS to any number (toll fraud / phishing) |
| 9 | HIGH | Tests | supabase/functions | 62/75 edge functions have no handler test; auto-release-payments excluded from guards |
| 10 | HIGH | UI | money screens | `font-ct-mono` rule unimplemented on every dollar figure |
| 11 | MED | Security | create-checkout-session / stripe-checkout | Client-supplied Stripe `priceId` with no server allow-list → self-subscribe cheaply |
| 12 | MED | Payments | generate-recurring-invoice:126 | Overlapping billing periods re-bill the same sessions |
| 13 | MED | Payments | stripe-webhook:1272 | `checkout.session.completed` update has no status filter; can resurrect terminal rows |
| 14 | MED | Payments | accept-and-pay:286 | Stale pending session never expired → double-charge window (also pay-price-increase) |
| 15 | MED | Payments | _shared/instantPayout.ts:450 | Racing release callers can diverge onto different idempotency keys → double payout |
| 16 | MED | Payments | resolve-dispute-split:127 | Split touches only newest job_funding row; siblings release in full on close |
| 17 | MED | Payments | pay-price-increase:276 | Adjustment child payments carry no commission split → GST-inclusive commission, no tax invoice |
| 18 | MED | Payments | stripe-connect-account:146 | `onboarding_complete` set from `details_submitted` alone; never reset false |
| 19 | MED | Security | access-pin:190/214 | PIN reset code from `Math.random()` with no attempt limit → brute-forceable |
| 20 | MED | Security | send-recurring/lead-reminders | Anon-key acceptance (part of #7); send-recurring-reminders also has no idempotency |
| 21 | MED | Database | tradie_details | Readable by every authenticated user via `SELECT USING(true)` |
| 22 | MED | Database | notifications | INSERT `WITH CHECK(true)` regressed across 4 migrations before final lockdown |
| 23 | MED | UI | ChatDrawer / TradieDashboard | Amber used decoratively; booked slots in rose; nested dim tints (contrast risk) |
| 24 | MED | Navigation | Navbar:40 / Footer:14 | Dead hash anchors `/#for-tradies`, `/#how-it-works` (no target elements) |
| 25 | MED | Tests | src/pages | 1 of 65 pages tested; guard suite covers only pre-DB refusals |
| 26 | LOW | Security | multiple | Service role by byte-compare / unverified JWT role claim (issue-fee-invoices, migrate-payout-schedules, dispute-evidence-summary, send-email, analyse-description-keywords) |
| 27 | LOW | Payments | multiple | Weak redirect validation (protocol-only) on 5 checkout/Connect functions; open-redirect off a payment flow |
| 28 | LOW | Payments | verify-license / verify-abn | `*_verified` boolean set true on format alone when authority API key unset |
| 29 | LOW | Database | client_errors:17 | INSERT `WITH CHECK(true)` with no role clause — unbounded anon insert |
| 30 | LOW | Database | app_settings / system_settings | UPDATE gated on identities no real account holds — dead admin gates |
| 31 | LOW | TypeScript | instantPayout.ts:410/426 (+5 helpers) | `stripe:any`/`payout:any` and `SupabaseLike=any` on money paths (was #27) |
| 32 | LOW | TypeScript | 4 pages | Hand-rolled row interfaces + `as unknown as` bypass generated types |
| 33 | LOW | Payments | multiple | Raw `err.message` / Stripe error detail returned to clients on catch |
| 34 | LOW | UI | Jobs / Settings / Pricing | Title Case (#13), inline `<style>` keyframes, off-scale radius, legacy v1 ramp classes |
| 35 | LOW | Navigation | Navbar:27 | "Post a job" logged-in link goes to /dashboard, not /post-lead |
| 36 | LOW | Tooling | scripts/check-deps.mjs | Silently misses vulns: reports "no output" while `npm audit` shows 2 moderate |
| 37 | LOW | Ops | debug-anthropic | Orphaned edge function live in prod (410 stub), not in repo — delete from dashboard |
| 38 | INFO | — | — | Carried: #11 unused indexes, #12 auth pool, #30 UnlockLeadModal "lead", #31 drift checkers, #32 contrast auth-routes |

Closed/improved this cycle: **#21** (lint errors, bbe2b4d) · **#28** (double-title) ·
**#29** (Pricing escrow heading) · the `has_user_engagement`/`get_daily_profile_view_count`
IDOR oracles (7034f87).

## Recommendations (prioritised)

### Critical — before this reads as production-solid
1. **Enforce `blocks_release` on the manual release path** (#1) — mirror the
   cron's dispute check in `release-escrow`. This is the one finding with direct
   platform-loss exposure (chargeback race).
2. **Bind and amount-check `verify-payment`** (#2) — reject when the session's
   metadata/amount doesn't match the invoice, even when no session id is stored.
3. **Close the anon-key auth bypass** (#7) on all four cron functions — swap to
   `hasServiceRole`. Small, mechanical, high-value.
4. **Lock down `send-sms`** (#8) — resolve the recipient server-side, restrict raw
   `to` to service callers, rate-limit per user. The `send-email` fix is the template.
5. **Server-derive or bound the deposit amount** (#3) and **add milestone/deposit
   dedupe** (#4), **an invoice-status guard on BECS** (#5), and **check the
   frozen-fee write** (#6).

### High — this sprint
6. Allow-list Stripe `priceId` (#11); fix overlapping-period double-billing (#12);
   add the checkout-session status filter (#13).
7. Start the edge-function guard tests where the money is (release-escrow,
   auto-release-payments, verify-payment, charge-becs-invoice) and wire
   `guards.test.ts` into CI (#9, #25).

### Medium — next sprint
8. `tradie_details` read scoping (#21) — the profiles-RLS project; `client_errors`
   anon-insert (#29); the two dead admin gates (#30).
9. Fix `check:deps` (#36) so vuln scanning actually runs; delete `debug-anthropic`
   (#37); fix the two dead marketing anchors (#24).
10. Design-system: begin the `font-ct-mono` money-figure pass (#10) and the
    semantic-colour corrections (#23).

### Low — backlog
11. Redirect-URL hardening (#27), service-auth capability-probe migration (#26),
    the `as unknown as` / unchecked-read cleanup (#31, #32), unused indexes (#11),
    auth pool strategy (#12).

## Score trend

| Date | Overall | Note |
|---|---|---|
| 2026-08-01 | 89.7% 🟡 | deeper copy/CSS instruments |
| 2026-08-02 | 93.3% 🟢 | 13 fix PRs |
| 2026-08-03 | 94.3% 🟢 | Navigation #9 closed |
| **2026-08-22** | **74% 🔴** | **live + adversarial money-path deep-hunt; partial-credit scoring — not directly comparable** |

The number fell because the depth rose. No dimension regressed in code; the
adversarial pass simply saw what the nightly checklist cannot.

## Next recommended action

Fix the `release-escrow` / `blocks_release` gap (#1) first — it is the single
finding where a real, unprivileged actor (a chargeback-raising cardholder) can
cause a direct, unrecoverable platform loss. Everything else is important; that
one is exposed money.

---

*Findings were produced unfiltered, then severity- and Tier-classified in a
separate pass per `docs/governance/CHANGE-POLICY.md`. Every HIGH money/auth
finding was verified by reading the cited source directly. Per the audit's
report-only scope, no code was changed. The escrow-release-on-client-inaction
policy is ratified and was scored as conforming, not as a defect.*
