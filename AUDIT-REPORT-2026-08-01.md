# Platform Audit Report — 2026-08-01

Full audit, desktop + mobile: every checker script (including the ones CI
skips), the persona crawl (anon/client/tradie × desktop/mobile, 212 checks),
the browser contrast sweep, Supabase advisors, an exhaustive interface-copy
sweep of `src/pages/` + `src/components/`, and a rule-by-rule audit of
`mobile-responsive.css`. Route inventory: `docs/audit/PAGE-MAP.md`.

Scoring per the audit skill, v2-remapped where its checklist predates the
design-system cutover. Two checklist items are scored per ratified policy,
not the stale checklist: escrow release-on-inaction is deliberate (see
CLAUDE.md; ratified 2026-07-30), and typecheck means `npm run typecheck`,
never `npx tsc --noEmit`.

## Summary

| Dimension | Score | Weight | Contribution | Status |
|-----------|-------|--------|--------------|--------|
| Security & Auth | 88.5% | 25% | 22.1% | 🟡 |
| Payments & Stripe | 100% | 25% | 25.0% | 🟢 |
| Database & RLS | 92.9% | 20% | 18.6% | 🟢 |
| TypeScript Safety | 100% | 10% | 10.0% | 🟢 |
| UI & Design System | 57.1% | 5% | 2.9% | 🔴 |
| Navigation | 80.0% | 5% | 4.0% | 🟡 |
| Test Coverage | 71.4% | 10% | 7.1% | 🔴 |
| **Overall** | **89.7%** | | | 🟡 |

**Read the trend honestly:** 95.4% → 89.7% is not a regression in the code —
nothing that passed on 2026-07-30 fails now, and the money paths measure
*better* (28 deployed money-path functions verified byte-identical to the
repo; 74/74 edge functions type-check; contrast sweep 0 AA failures; persona
crawl 212/212). The drop is new *measurement*: this audit swept interface
copy exhaustively (~700 findings, a dimension never previously measured) and
audited all 1,080 lines of `mobile-responsive.css` (12 dead rule groups, 28
overbroad, 1 live bug). Deeper audit, lower score, same platform.

## Detailed Check Results

### Security & Auth (88.5% 🟡)

| Check | Weight | Result | Notes |
|---|---|---|---|
| Bearer token verified | 3× | ✅ | fleet-wide, re-verified in prior audits; no-verify-jwt audit clean |
| CORS not wildcard | 2× | ✅ | allow-list via corsFor(req); fleet consistent since 943ba90 |
| Input validation | 3× | ✅ | |
| Structured errors | 1× | ✅ | |
| No hardcoded secrets | 3× | ✅ | |
| Rate limiting | 2× | ✅ | DB-backed (`edge_rate_limits` + RPC); inventory in docs/edge-function-rate-limits.md |
| Webhook signature validation | 3× | ✅ | |
| RLS enabled on all tables | 3× | ✅ | 4 tables RLS-enabled-with-no-policies (edge_rate_limits, service_decline_tokens, stripe_webhook_events, worker_credential_notifications) = deny-all, service-role only — intentional |
| No permissive SELECT on sensitive tables | 3× | ❌ | carry-over #10: `tradie_details` / `platform_config` publicly readable; partially intentional (public profiles), needs the column-level review bundled with the profiles-RLS work |
| auth.uid() used correctly | 3× | ✅ | advisor SECURITY DEFINER RPC warnings reviewed — the definer functions are the deliberate 3-role-auth pattern; identity *guards* are INVOKER per the 20260718 lesson |

### Payments & Stripe (100% 🟢)

All checks pass. Evidence this cycle: `check:edge-drift` verified all 28
money-path functions deployed in prod match `origin/master`; webhook
signature validation present; idempotency e2e-proven (2026-07-25 v2.1 run);
escrow via Stripe Connect destination charges — platform never holds funds.
The checklist's "client-initiated release only" item is scored against the
**ratified** escrow policy (5-hour review window, `blocks_release` the only
freeze decider): the code is correct, the checklist is stale.

### Database & RLS (92.9% 🟢)

| Check | Weight | Result | Notes |
|---|---|---|---|
| RLS on every table | 3× | ✅ | |
| CRUD policies per table | 3× | ✅ | |
| No overly-permissive write policies | 3× | ✅ | #8 (overlapping permissive SELECT policies on `cancellation_policies`, `profile_private`) is redundancy, not exposure — open as MEDIUM |
| FK columns indexed | 2× | ✅ | |
| Composite/current indexes | 1× | ❌ | #11: ~55 unused indexes (advisors re-confirmed); revisit after real traffic |
| No N+1 in edge functions | 2× | ✅ | |

### TypeScript Safety (100% 🟢)

`npm run typecheck` 0 errors · `typecheck:edge` 74/74 · `check:columns`
clean · types from generated `supabase.ts` · Supabase calls wrapped. The 7
deliberate exclusions (siteGeofence et al.) remain deliberate. Separate
non-checklist finding: the **eslint backlog is 91 errors / 53 warnings**
(#21) — mostly unused vars in edge functions and useless escapes; lint now
runs in CI as informational.

### UI & Design System (57.1% 🔴) — the new-measurement dimension

| Check (v2-remapped) | Result | Notes |
|---|---|---|
| Layout constraints | ✅ | |
| v2 card/radius/token patterns | ✅ | `check:tokens`: every ct- utility resolves (211 files); `check:ink` clean |
| Buttons per system | ✅ | |
| Contrast (rendered) | ✅ | browser sweep: 0 AA failures, both viewports, modals opened |
| Palette semantics / no stray colour | ❌ | #7 carry-over: residual hex in 8 files (chart palettes, `text-[#1D9E75]`) |
| No custom CSS | ❌ | #18: `mobile-responsive.css` — 12 dead rule groups, 28 overbroad, and one **live bug**: section N forces `display:inline-flex !important` on `p-1` buttons, so a `hidden sm:inline-flex` button renders on mobile when it should not |
| Copy rules (sentence case, empty states, error copy) | ❌ | #13–#17 below: ~700 violations |

### Navigation (80.0% 🟡)

Persona crawl **212/212 passed** (anon/client/tradie × desktop/mobile): every
route reachable, a way out everywhere, tap targets pass. Deductions: #9
orphaned/deep-link-only routes (baselined, decision D-territory) and the two
link bugs found and fixed this cycle (#20, PR #201). `check:nav:ci` 0 new vs
baseline.

### Test Coverage (71.4% 🔴)

Unchanged from 2026-07-30: e2e money-path harnesses and the CI Deno tests
pass; the file ratio (~25 test files vs ~290 source) and page/component
coverage remain the weak spots.

## All Findings (severity-ranked; #1–#12 numbering continues the 2026-07-30 report)

| # | Sev | Area | Finding | Status |
|---|---|---|---|---|
| 13 | MEDIUM | Copy | Title Case throughout: ~310 strings in client-facing pages, ~245 in components, ~55 admin, 30 legal headings — the v2 sentence-case rule is followed almost nowhere outside `src/components/ui/` | OPEN — batch plan below |
| 14 | MEDIUM | Copy | 37 empty states with no next action, incl. `SimpleCharts.tsx:75` rendering the literal `"No data"` that `ui/EmptyState.tsx` names as the anti-pattern; 3 error dead-ends ("Client not found" with no way back) | OPEN |
| 15 | MEDIUM | Copy | Button→toast verb drift ×5: Release Now/Release Payment same handler; sent→"emailed"; End service→"cancelled"; Request Payment vs Request Payout; Put on Hold vs paused | **FIXED — PR #202** |
| 16 | MEDIUM | Copy | "escrow" in 40 user-visible strings across 20 files (SEO landing pages, Pricing, Footer link "How Escrow Works", Payouts status chip "In Escrow") — rule 5 violation; the compliant vocabulary already exists ("held safely by Stripe until you approve") | OPEN — also AFSL-adjacent: wording must keep saying *Stripe* holds funds |
| 17 | MEDIUM | Copy/UX | Raw internals reach users: unmapped payment-status enums render into pills (`Payouts.tsx:1227,1288`, `PaymentHistory.tsx:517`), and `\|\|`-fallback error handling surfaces raw server strings (`WorkforceClaim.tsx:69`, `ClientDetail.tsx:132,337`, `ClientServicesTab.tsx:1865`) | OPEN |
| 18 | MEDIUM | CSS | `mobile-responsive.css`: 12 dead rule groups (mostly killed by the v2 palette cutover), 28 overbroad (worst: `main .flex.items-center.gap-2 > button` min-height across ~130 files; unscoped `.border-b > .flex` tab-row rule across 48 files; `main > div > nav:first-of-type` hides any first nav below 640px), plus the live section-N `inline-flex !important` bug and two internally-conflicting rule pairs (A/AB, M/O). Also: `#root { overflow-x:hidden }` masks every horizontal-overflow bug app-wide; focus outline hardcodes stale v1 colours | OPEN — decision D3 (phased retirement); the dead-rule deletion and section-N fix are Tier A |
| 19 | ~~LOW~~ **MEDIUM** | SEO | react-helmet-async committed ZERO tags in dev AND production (not just titles): all 19 SEO pages served the homepage's meta description/OG tags and a canonical of `/` — telling search engines every page was the homepage. Severity upgraded on investigation | **FIXED — PR #210** (helmet removed; SEO.tsx writes head tags directly, restores defaults on unmount; verified live) |
| 20 | LOW | Nav | Navbar sent tradies through the `/jobs` redirect; PaymentHistory's `/jobs?job=` deep-link lost its query string in that redirect | **FIXED — PR #201** |
| 21 | MEDIUM | Quality | eslint: 91 errors / 53 warnings, incl. unused fee-calculation imports in `pay-price-increase` and `no-unused-expressions` in QuoteEstimator/NewGroupModal | OPEN — CI job added (informational) |
| 22 | LOW | Tooling | `check-ct-tokens.mjs` could never run on Windows (single-quote execSync → cmd.exe crash); local sweeps silently lacked the token check | **FIXED — audit branch** |
| 23 | LOW | Content | `public/terms/index.html` + `public/privacy/index.html` duplicate the React legal pages in a light theme; dates match today, divergence is one legal edit away | OPEN — decision D2 |
| 24 | LOW | Copy | ALL CAPS outside the mono-meta exemption: URGENT/HIGH PRIORITY/FREE badges + 4 admin tables of bare-`uppercase` headers; also `Verification.tsx` "Center"/licence-vs-license US spellings in tradie surfaces | OPEN |
| 25 | INFO | A11y | The two lightbox close buttons (`JobDetailsCard.tsx:114`, `Leads.tsx:3338`) have no aria-label — found via the dead CSS rule AA that assumed one existed | OPEN |

Carried over from 2026-07-30, re-confirmed this cycle: **#7** residual hex
(8 files) · **#8** overlapping RLS policies · **#9** orphaned routes ·
**#10** public SELECTs · **#11** ~55 unused indexes · **#12** fixed
10-connection Auth allocation.

## Recommendations (prioritised)

**This cycle (Tier A, batched PRs — owner merges each):**
1. ✅ PR #201 links · ✅ PR #202 verb drift
2. `fix/audit-empty-states` — the 9 bare empty states + 3 dead-ends (#14)
3. `fix/audit-css-dead-rules` — delete the 12 dead rule groups + section-N
   `inline-flex` bug + A/AB & M/O conflict cleanup (#18, safe subset)
4. `fix/audit-copy-batch-1` — Title Case on the top client-facing surfaces
   (auth, dashboards, search, payments, review flow), then batch 2+ weekly
5. `fix/audit-status-fallbacks` — map unmapped enums, stop surfacing raw
   server errors (#17)

**Owner decisions pending (Tier B — docs/governance/DECISIONS-PENDING.md):**
D1 branch protection · D2 legal-page redirect (#23) · D3
mobile-responsive.css phased retirement (#18 rest) · D4 chart tokens (#7) ·
D5 policy merge (#8) · D6 public-SELECT tightening (#10, with profiles-RLS)
· D7 nightly audit task.

**Post-launch:** #11 unused indexes (needs real traffic) · #12 auth pool
(percentage strategy) · escrow-wording sweep (#16) alongside a marketing
copy review · test-coverage build-up.

## Score Trend

| Date | Overall | Note |
|---|---|---|
| 2026-06-12 | — | earlier format |
| 2026-07-01 | 85.6% 🟡 | |
| 2026-07-30 | 95.4% 🟢 | five amendments in one day |
| **2026-08-01** | **89.7% 🟡** | first audit to measure copy + mobile CSS; no code regressions — see Summary note |

## Next Recommended Action

Merge PRs #201/#202, then land the empty-state and dead-CSS-rule batches —
they are the highest user-visible value per line changed, and the CSS batch
removes the file's only live bug.
