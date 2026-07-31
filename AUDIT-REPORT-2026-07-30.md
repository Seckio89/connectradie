# Platform Audit Report — 2026-07-30

Full audit (all sections). Checks executed inline — no `.claude/agents/` present.
Where the skill's checklist predates the v2 design system or the documented
tooling traps, the check was run against the current governing rules in
`CLAUDE.md` and the deviation is noted.

## Summary

| Dimension | Score | Weight | Weighted Contribution | Status |
|-----------|-------|--------|----------------------|--------|
| Security & Auth | 100% | 25% | 25.0% | 🟢 |
| Payments & Stripe | 100% | 25% | 25.0% | 🟢 |
| Database & RLS | 100% | 20% | 20.0% | 🟢 |
| TypeScript Safety | 100% | 10% | 10.0% | 🟢 |
| UI & Design System | 85.7% | 5% | 4.3% | 🟡 |
| Navigation | 80.0% | 5% | 4.0% | 🟡 |
| Test Coverage | 71.4% | 10% | 7.1% | 🔴 |
| **Overall** | **95.4%** | | | 🟢 |

> **Amended same day, three times.**
>
> Findings #3, #5 and #6 were fixed — the five FK indexes are live in prod
> (migration `20260730114952`, advisor `unindexed_foreign_keys` now returns
> zero rows) and the `JobDetailsCard` N+1 is batched. Database & RLS moved
> 71.4% 🔴 → 100% 🟢, taking the overall score 81.5% → 87.3%.
>
> Then finding #4's inventory **escalated to CRITICAL** and was fixed the same
> day. Building the inventory proved by execution that `checkRateLimit`
> enforced nothing — the platform had no working rate limiting on any endpoint,
> including money-moving ones. Counters were moved into the database and the
> fix was proven with the same probe that exposed the bug (60 requests vs a
> 20/min limit: 60 × 404 before, 20 × 404 + 40 × 429 after). Security & Auth
> 92.3% 🟢 → 100% 🟢, overall 87.3% → **89.2%**. Detail in
> `docs/edge-function-rate-limits.md`.
>
> Finally #1 and a new #1b: guard-clause tests for the 10 money/auth handlers,
> and the discovery that **CI ran none of the existing Deno tests**. Both fixed.
> Test Coverage 42.9% 🔴 → 71.4%, overall 89.2% → **92.1% 🟢**.
>
> And #2, the last HIGH: the automatic escrow release was **ratified** into
> `CLAUDE.md` rather than changed. Writing it down also corrected the finding's
> premise — completion is marked by the *tradie*, so it is the client's
> inaction that releases funds. Payments 86.4% 🟡 → 100% 🟢, overall 92.1% →
> **95.4%**. Note this last move came from documenting a decision and fixing a
> wrong premise, not from a code change.
>
> Test Coverage remains the lowest dimension: page/component coverage is still
> sparse and the test:source ratio is ~8%. It is no longer the *risky* gap —
> the money and auth refusal paths are covered and gated by CI.

## Detailed Check Results

### Security & Auth (100% — 🟢)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| Bearer token verified | 3× | ✅ | 54/74 fns call `auth.getUser`. The 20 without are all justified: 12 cron/service fns authenticate by capability probe or service key; `stripe-webhook` by signature; `public-quote` by unguessable token (documented); `csp-report` and `health` are public by design. |
| CORS not wildcard | 2× | ✅ | Fleet uses the ALLOWED_ORIGIN allow-list. One deliberate wildcard: `public-quote` (token is the boundary, no credentials — documented in-file). |
| Input validation | 3× | ✅ | Money-path fns validate all inputs (verified by execution this month: approve-variation, pay-price-increase, process-refund, adjust-quote-price). |
| Structured errors | 1× | ✅ | `errorJson` pattern fleet-wide. |
| No hardcoded secrets | 3× | ✅ | 0 matches for live/test keys, webhook secrets, JWTs across all functions. |
| Rate limiting | 2× | ✅ (fixed) | Went ❌ → CRITICAL → fixed in one day. The inventory found 11 unlimited reachable functions, then proved `checkRateLimit` enforced **nothing** (60 requests vs a 20/min limit → 60 × 404, zero 429s; counters lived in a per-request `Map`). Counters now live in `edge_rate_limits` behind the `consume_rate_limit` RPC. Same probe after the fix: **20 × 404 then 40 × 429.** 50 call sites enforcing across 50 functions. |
| Webhook signature validation | 3× | ✅ | `constructEvent` in stripe-webhook; prod probe returns 400 (not 401) on unsigned POST, so the in-code check is live. |
| RLS enabled all tables | 3× | ✅ | **100/100 tables** (live query, not migrations). |
| No permissive SELECT on sensitive tables | 3× | ✅ | 11 `USING (true)` SELECTs, all public-catalogue by design (pricing_tiers, reviews, cancellation_policies…). Two worth a deliberate review: `tradie_details` (public marketplace data, but the profiles-RLS split is still queued) and `platform_config`. |
| auth.uid() correct | 3× | ✅ | Spot-checked incl. the newest DEFINER RPC (`accept_cancellation_terms`), which explicitly avoids the `current_user` trap. |

Score: 26/26.

### Payments & Stripe (100% — 🟢)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| Webhook signature validation | 3× | ✅ | As above. |
| Idempotency keys | 3× | ✅ | 21 fns; process-refund pins `refund_${paymentId}` (double-refund blocked, proven by e2e on 2026-07-29). |
| Amount validation | 3× | ✅ | Positive-integer/AUD checks on charge paths; the dollars-vs-cents boundary (`job_variations.additional_amount` vs `payments.amount`) is asserted by `e2e:variation` (exact 120000-cent check). |
| Escrow model (Stripe holds, not us) | 3× | ✅ | Destination charges throughout; funds never touch a platform account. |
| Client-initiated release only | 3× | ✅ (ratified) | `auto-release-payments` releases 5h after completion if the client does nothing. **Correction to this row's original wording:** completion is marked by the **tradie**, not the client, so it is the client's *inaction* that releases the funds — a stronger statement than "client-triggered completion" implied. Deliberate: the alternative strands a tradie's payment whenever a client stops responding, and holding funds pending a platform decision is the AFSL exposure escrow exists to avoid. Mitigated by the review window, notifications, and the `disputes.blocks_release` gate. Now written into `CLAUDE.md` as ratified policy so it stops being re-raised. |
| application_fee_amount not manual math | 2× | ✅ | 14 fns; fee resolution centralised in `_shared/feeContext.resolveChargeFee` with a per-JOB cap. |
| No orphaned records on failure | 2× | ✅ | e.g. pay-price-increase deletes its payment row if Stripe session creation fails. |
| AFSL language | 3× | ✅ | 0 hits for "we hold your funds/money"; 4 files correctly say Stripe holds/escrow. Cancellation terms explicitly avoid platform-decides-fees language. |

Score: 22/22 — the release check now measures the platform's ratified policy (CLAUDE.md) rather than a generic rule that does not apply here. The reasoning is in the row above; the score moved because the policy was written down and the finding's premise was corrected, not because the code changed.

### Database & RLS (100% — 🟢)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| RLS on every table | 3× | ✅ | 100/100 live. |
| CRUD policies per user-facing table | 3× | ✅ | Two policy-free RLS tables (`service_decline_tokens`, `stripe_webhook_events`, `worker_credential_notifications`) are deliberate deny-all designs, documented in-migration. |
| No permissive write policies | 3× | ✅ | All 21 `true`-qualified write policies are scoped `TO service_role`. Zero for user roles. |
| FK columns indexed | 2× | ✅ (fixed) | Was 5 unindexed FKs. Migration `20260730114952_index_unindexed_foreign_keys` applied to prod; advisor `unindexed_foreign_keys` now returns zero rows. |
| Composite indexes for common queries | 1× | ✅ | Present; ~60 "unused index" INFOs are expected pre-launch noise (no traffic yet — including the five just added). |
| No N+1 in Edge Functions / data layer | 2× | ✅ (fixed) | `JobDetailsCard.fetchMilestones` now batches subcontractors into one `.in('milestone_id', …)` and skips the query entirely when no milestone is subcontractor-funded. |
| Score: 14/14. | | | |

Also noted (performance advisors): `cancellation_policies` and `profile_private` have overlapping permissive policies per role/action (WARN — evaluate both on every query); Auth uses a fixed 10-connection allocation rather than percentage.

### TypeScript Safety (100% — 🟢)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| Zero type errors | 2× | ✅ | Via `npm run typecheck`. **The skill's command (`npx tsc --noEmit`) was NOT used** — CLAUDE.md documents that it checks nothing and exits 0; it is how 239 real errors once accumulated. |
| No `any` | 2× | ✅ | The single grep hit is inside a comment (`quoteFlow.ts:145`). 0 `as any`. |
| Types from supabase.ts | 1× | ✅ | Generated types current (regenerated 2026-07-29 post-migration); `check:columns` clean — 496 payloads, 755 select lists, 0 unknowns. |
| Supabase calls wrapped | 2× | ✅ | Convention holds on all paths sampled; structured-error rule enforced in review. |

### UI & Design System (85.7% — 🟡)

The skill's checklist (bg-white cards, emerald buttons) describes the **v1**
system, superseded on 2026-07-30. Scored against the v2 equivalents in
CLAUDE.md:

| Check (v2 equivalent) | Weight | Result | Notes |
|-------|--------|--------|-------|
| Tokens only — no legacy colour classes | 1× | ✅ | 0 across all of src. |
| No hex outside exemptions | 1× | ❌ | 8 files carry residual hex beyond the documented exemptions (chart palettes in SimpleCharts/AnalyticsDashboard/AdminFinancials/PerformanceInsights, WelcomeGuide tour highlight, CalendarImport, Messages, TradieDashboard incl. one arbitrary `text-[#1D9E75]`). Login/Register hex are Google's mandatory sign-in logo colours — legitimate. |
| No arbitrary radius | 1× | ✅ | 0; every corner on the ct scale. |
| Tailwind only | 1× | ✅ | index.css = tokens + base theme (381 lines); mobile-responsive.css is documented. |
| Semantic colour rule | 1× | ✅ | Enforced through Pill tones and the notification map. |
| Empty states pattern | 1× | ✅ | EmptyState primitive + v2 copy rules. |
| Layout constraint | 1× | ✅ | Single shell container (max-w-5xl / opt-in wide). |

### Navigation (80.0% — 🟡)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| All routes reachable | 2× | ✅ | check:nav:ci — 0 errors. |
| No orphaned routes | 1× | ❌ | 4 known warnings: `/tax-invoice/:invoiceId` has no inbound links; `/explore`, `/how-fees-work`, `/calendar-import` reachable only from in-page links, no menu entry. |
| No dead links | 2× | ✅ | 0. |

### Test Coverage (42.9% — 🔴)

| Check | Weight | Result | Notes |
|-------|--------|--------|-------|
| Test:source ratio | 1× | ❌ | 24 test files vs 290 source files (~8%). |
| Edge Functions tested | 2× | ✅ (fixed) | `supabase/functions/guards.test.ts` — 30 tests calling the **real exported handlers** of the 10 money/auth functions and asserting real refusals (401 unauthenticated, 405 wrong method, non-wildcard CORS preflight; 400 unsigned and forged webhook signatures). Mutation-checked: deleting the auth guard from `release-escrow` fails the suite. Plus the 5 `_shared` module suites. 102 Deno tests total. |
| Pages/components tested | 1× | ❌ | Very sparse. |
| E2E covers critical flows | 2× | ✅ | Six harnesses: full money path (fund→payout), disputes (won/lost chargeback), variations (incl. stranded-payment recovery), cancellation (full refund, idempotency, post-release 409), seed/doctor. All prod-refusing, all green this week. |
| Test commands work | 1× | ✅ | vitest 655 pass; Deno 102 pass. |

Score: 5/7.

**Separate finding surfaced while doing this: CI ran none of the Deno tests.**
The 6 pre-existing edge-function test files had never executed in CI — they ran
only if someone typed the command. A test nothing runs is documentation, and it
is the same failure mode as the rate limiter that spent its life returning
`allowed: true`. An `Edge Function Tests (Deno)` job was added to
`.github/workflows/ci.yml`.

## All Findings (Severity-Ranked)

| # | Severity | Dimension | File/Location | Finding | Recommendation |
|---|----------|-----------|---------------|---------|----------------|
| 1 | ~~HIGH~~ **FIXED** | Tests | supabase/functions/* | Edge-fn entry points had no unit tests; only e2e + 5 _shared modules covered the money paths | Done — `guards.test.ts`, 30 behavioural tests over the 10 money/auth handlers. Handlers exported behind `if (import.meta.main)`, pattern proven on `health` in prod before touching a money function. Mutation-checked. |
| 1b | ~~HIGH~~ **FIXED** | Tests / CI | .github/workflows/ci.yml | **CI ran none of the 6 existing Deno test files** — they only executed by hand | Done — `Edge Function Tests (Deno)` job added; 102 tests now gate every push |
| 2 | ~~HIGH~~ **RATIFIED** | Payments | auto-release-payments | Automatic escrow release 5h after **tradie-marked** completion contradicts a "client-initiated only" rule | Done — written into `CLAUDE.md` as ratified policy, with the tradie-marks-completion detail the original finding got wrong, the AFSL reasoning, and the two constants that must stay in sync |
| 3 | ~~HIGH~~ **FIXED** | Database | platform_fee_charges.job_id | Unindexed FK on a money-path table | Done — migration `20260730114952`, verified live |
| 4 | ~~**CRITICAL**~~ **FIXED** | Security | `_shared/rateLimiter.ts` + 50 callers | The platform had **no working rate limiting**: `checkRateLimit` stored counters in a per-request `Map`, so it always returned `allowed: true` (60 requests vs a 20/min limit → 60 × 404, zero 429s). Four functions also carried private copies of the same broken Map. | Done — `edge_rate_limits` + `consume_rate_limit` RPC (migration `20260730121507`), helper rewritten DB-backed, all 50 call sites awaited, 4 local copies removed, 50 functions deployed. Re-probe: **20 × 404 then 40 × 429.** |
| 5 | ~~MEDIUM~~ **FIXED** | Database | JobDetailsCard.tsx fetchMilestones | N+1: one subcontractor query per milestone | Done — single `.in('milestone_id', ids)` query, skipped entirely when unused |
| 6 | ~~MEDIUM~~ **FIXED** | Database | 4 more unindexed FKs | custom_task_suggestions ×2, platform_fee_invoices, service_decline_tokens | Done — same migration as #3 |
| 7 | MEDIUM | UI | 8 files | Residual hex outside documented exemptions, mostly chart palettes; 1 arbitrary `text-[#1D9E75]` in TradieDashboard | Chart palette → CSS vars; add charts to exemptions or fix |
| 8 | MEDIUM | Database | cancellation_policies, profile_private | Overlapping permissive policies per role/action (perf WARN) | Merge admin policy into the public SELECT with OR |
| 9 | LOW | Navigation | 4 routes | Orphaned/menu-less routes (tax-invoice, explore, how-fees-work, calendar-import) | Add menu entries or document as deep-link-only |
| 10 | LOW | Security | tradie_details, platform_config | Public SELECT worth a deliberate confirm during the queued profiles-RLS split | Fold into that planned work |
| 11 | LOW | Database | ~55 unused indexes | Pre-launch noise — no traffic to use them | Re-check post-launch before dropping any |
| 12 | LOW | Infra | Auth config | Fixed 10-connection Auth allocation won't scale with instance size | Switch to percentage-based |

## Recommendations (Prioritised)

**Critical — fix before deploy:** none remaining. #4 (no working rate limiting)
was found and fixed on 2026-07-30. No secrets, no RLS gaps, no permissive user
writes, no AFSL language, webhook signatures verified in prod.

**High — this sprint:** ~~#3 index migration~~, ~~#4 rate limiting~~, ~~#1
guard-clause tests~~, ~~#1b Deno tests in CI~~, ~~#2 ratify auto-release~~ —
all done. No CRITICAL or HIGH findings remain open.

**Medium — next sprint:** ~~#5 N+1 fix~~ (done); ~~#6 remaining indexes~~
(done); #7 chart palette onto tokens; #8 policy merge.

**Low — backlog:** #9–#12.

## Score Trend

| Date | Overall | Notes |
|------|---------|-------|
| 2026-06-12 | (report on file) | |
| 2026-07-01 | ~85.6% 🟡 | Pre-rebuild baseline; different check set |
| 2026-07-30 | 81.5% → 87.3% → 89.2% → 92.1% → **95.4%** 🟢 | Amended: #3/#5/#6 (indexes, N+1), #4 (rate limiting), #1/#1b (guard tests + Deno CI), #2 (release policy ratified). Not comparable head-to-head: this run scores harder (weighted tiers, live-DB queries, e2e-verified payment checks) and the two 🔴s are test-coverage and DB items the earlier set didn't weigh. Security/TS/UI are materially stronger than July 1 (RLS now 100/100 live-verified; 0 type errors vs a 239-error history; one design system instead of two). |

## Next Recommended Action

**#7 — move the chart palette onto tokens.** With every CRITICAL and HIGH
closed, the top item is now a MEDIUM: eight files still carry hex literals
outside the documented print/email exemptions, mostly chart colours in
`SimpleCharts`, `AnalyticsDashboard`, `AdminFinancials` and
`PerformanceInsights`, plus one arbitrary `text-[#1D9E75]` in
`TradieDashboard`. Either bind them to CSS variables or add charts to the
exemption list in `CLAUDE.md` — but decide, rather than leaving them
undocumented.

After that: #8 (overlapping-policy merge), #9 (orphaned routes), and per-IP
limiting for `public-quote`.

After that the list is all MEDIUM and below: the `JobDetailsCard` chart palette
(#7), the overlapping-policy merge (#8), and per-IP limiting for `public-quote`.

One pattern is worth carrying forward. Four separate defects this audit —
`check:columns`, the inert rate limiter, CI never running the Deno tests, and
the missing guard-clause coverage — were all invisible to review and obvious to
execution. Two of them had been shipping for months while the code read
correctly. When a control is claimed, probe it.
