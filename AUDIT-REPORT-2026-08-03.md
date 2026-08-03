# Platform Audit Report — 2026-08-03

Nightly audit on master at `8498a2e`, after the twelve PRs (#214–#226) that
landed since the 08-02 re-audit. Same instruments as the last two cycles, with
the caveats recorded under *Instrument coverage* below: this environment cannot
reach `jsr.io`/`deno.land`, and has no Supabase access token. The Deno edge
typecheck could not run *here* but CI ran it green on this commit; only the two
drift checkers went genuinely unverified.

## Summary

| Dimension | Score | Weight | Contribution | Status | vs 08-02 |
|-----------|-------|--------|--------------|--------|----------|
| Security & Auth | 100% | 25% | 25.0% | 🟢 | = |
| Payments & Stripe | 100% | 25% | 25.0% | 🟢 | = |
| Database & RLS | 92.9% | 20% | 18.6% | 🟢 | = |
| TypeScript Safety | 100% | 10% | 10.0% | 🟢 | = |
| UI & Design System | 71.4% | 5% | 3.6% | 🟡 | = |
| Navigation | 100% | 5% | 5.0% | 🟢 | ▲ 80.0 |
| Test Coverage | 71.4% | 10% | 7.1% | 🔴 | = |
| **Overall** | **94.3%** | | | 🟢 | **▲ 93.3** |

93.3% → **94.3%**. The single point of movement is Navigation, earned by #216
closing finding #9. That is a real close, but it is the *only* scored movement:
five dimensions are unchanged and the two 🟡/🔴 dimensions did not move at all.

The honest read of this cycle is that a lot of good work landed that the rubric
cannot see. #217 eliminated the "Something went wrong" class, #219 sentence-cased
the shared components, #220 replaced the escrow wording, #218 retired another
mobile-CSS tranche, and #221–#223 added three batches of tests — 958 tests now
pass across 33 files. None of that shifts a score, because the *checks* those
dimensions fail on (mobile-responsive.css tranches 3–7, the admin/legal copy
batches, edge-function test coverage) are each still open. The score is flat;
the platform is not.

## Instrument coverage

Three checks in the standing suite could not execute here. None is a code
defect, and none is scored — but a nightly run that silently skips them would
be reporting less than it appears to.

| Instrument | Status | Reason |
|---|---|---|
| `typecheck:edge` | **not run locally · green in CI** | `jsr.io` and `deno.land` both return 403 from the egress proxy, so Deno cannot resolve `jsr:@supabase/functions-js` and 73/74 functions fail to *load*, not to typecheck. Purely an artefact of the blocked egress: CI's *Edge Functions (Deno ratchet)* job ran `scripts/typecheck-edge.mjs` to success on this same commit. Verified — just not from here. |
| `check:drift` | **not run** | needs `SUPABASE_ACCESS_TOKEN`; arbitrary SQL has no other route. |
| `check:edge-drift` | **not run** | needs Supabase CLI auth; 28 money-path functions unverified against deployed. |

Only the two drift checkers are a real coverage gap — CI skips them too
(*Drift (schema + edge, informational)* was skipped), so nothing verified them
this cycle.

The edge-drift gap is materially covered this cycle by other means: `git log`
confirms **no file under `supabase/functions/` changed since 08-02**, so the
08-02 verification (28 deployed money-path functions byte-identical to master)
still holds by construction.

One runbook note worth recording, because it cost a full sweep to diagnose: on a
fresh clone with no `.env`, `check:contrast` does not fail loudly — it reports
"No AA contrast failures" alongside 88 blank routes, because every authenticated
route renders an empty body once the Supabase client fails to construct. The
pass line and the failure line are both true and read as contradictory. The
sweep only measures the app half with `VITE_SUPABASE_URL` set to the real
project ref (the checker hardcodes `REF = 'uoqygmizupdpanplpvor'` and fakes the
session against it). Both runs are recorded below.

## Evidence, by dimension

**Security & Auth 100%** — all 10 checks pass, verified by execution.
74 functions scanned: 20 carry no `auth.getUser`, and every one is accounted
for — 13 crons behind a service-role capability probe (`_shared/serviceAuth.ts`,
which probes `listUsers` rather than sniffing the token's shape), `stripe-webhook`
behind `constructEventAsync` signature validation, `geofence-event` behind a
device token, and `health`/`csp-report`/`public-quote` public by design. No
hardcoded secrets (`sk_`/`pk_`/`whsec_` scan clean). 73/74 use an origin
allowlist; the sole wildcard is `public-quote`, documented in-file as
token-gated with no credentials and rate-limited per IP. Live advisors are
identical to 08-02: four deny-all service-role tables and the deliberate
SECURITY DEFINER RPC pattern, both intentional and both previously ratified.

**Payments 100%** — all 8 checks pass. Idempotency keys present on all 17
money-path functions; `application_fee_amount` used across 14; currency is AUD
everywhere (57 literals, no exceptions). The escrow invariants hold as
ratified: `RELEASE_WINDOW_HOURS = 5` in both `src/lib/releaseWindow.ts:7` and
`auto-release-payments/index.ts:81` (now guarded against drift by #221), and
`blocks_release` is the sole payout-freeze decider with no dispute-status
enumeration anywhere near the release path. No AFSL-risky wording found.

Note for future runs: the skill's *"client-initiated release only"* check is
scored as a pass. Escrow releasing on client inaction is the ratified model
(CLAUDE.md, finding #2 of 2026-07-30) — the check is wrong, not the code.

**Database & RLS 92.9%** — sole deduction is unchanged: ~57 unused indexes
(#11), a post-launch item that needs real traffic to judge. Plus the auth
connection-pool advisory (#12), still absolute rather than percentage-based.

**TypeScript 100%** — typecheck 0 errors; `check:columns` clean across 508
write payloads and 778 select lists (2 payloads remain unverifiable by either
the scanner or the compiler). `src/` is free of `any`. Lint backlog essentially
unchanged at 91 errors / 53 warnings (#21, was 91/54).

**UI & Design System 71.4%** — tokens, ink and contrast all clean: **0 AA
failures** across 19 public + 18 app routes plus 2 account-state variants, over
33 route/tab surfaces, both viewports, modals opened. Still failing the same
two checks as 08-02: *no-custom-CSS* (`src/styles/mobile-responsive.css`, 1017
lines, tranches 3–7 outstanding after #218 took tranche 2) and *copy rules*
(Title Case persists in the admin/analytics/legal batches — `AdminDisputes`,
`AdminFinancials`, `AnalyticsDashboard`, `Onboarding` among others). The
error-copy class is now **closed**: the only surviving "Something went wrong"
is a deliberate test fixture in `useToast.test.ts:35`.

**Navigation 100%** — 62 routes, 539 internal links, 38 nav destinations;
0 errors, 0 warnings, 0 new since baseline. Finding #9 (the orphan set) is
closed by #216. Three findings remain baselined and are carried below as open
items rather than deducted here, because none of them is a reachability
defect: they are one duplicate-titling issue and two jargon strings.

**Test Coverage 71.4%** — unchanged score, materially improved substance.
33 test files / 958 tests, all passing, up three batches this cycle
(#221 release-window drift, #222 component+hook, #223 lib logic). The failing
check is the same one as 08-02 and is the reason the score did not move:
edge-function coverage sits at 7 test files against 74 functions. The sharper
open gap is pages — **0 of 65 have a test**. E2E covers auth, search, public
pages and navigability as Playwright specs, with job-lifecycle flows (dispute,
variation, cancel, bootstrap) as separate seed-driven scripts.

## All findings (severity-ranked)

| # | Sev | Dimension | File | Finding | Recommendation |
|---|-----|-----------|------|---------|----------------|
| 11 | MEDIUM | Database | — | ~57 unused indexes | Leave until real traffic; re-judge post-launch |
| 12 | MEDIUM | Database | — | Auth pool is absolute (10 conns), not percentage-based | Switch before scaling instance size |
| 13 | MEDIUM | UI/copy | admin, analytics, legal pages | Title Case remains in batches 3+ | Continue the sentence-case sweep |
| 18 | MEDIUM | UI | `src/styles/mobile-responsive.css` | 1017 lines of custom CSS; tranches 3–7 open | Continue the D3 retirement track |
| 21 | MEDIUM | TypeScript | repo-wide | Lint backlog 91 errors / 53 warnings | Batch by rule; `_pid`/`_pa` unused-vars in `stripe-webhook:259` are trivial |
| 27 | LOW | Payments/TS | `_shared/instantPayout.ts:329,344` | `stripe: any` and `payout: any` on a money path | Annotated `deno-lint-ignore`, confined to the Stripe SDK boundary; amounts, currency and idempotency are all typed. Type when the SDK's Deno types improve |
| 28 | LOW | Navigation | `src/App.tsx` | 19 pages render `<SEO>` while RouteTracker also titles them | Pick one owner for document.title |
| 29 | LOW | UI/copy | `src/pages/Pricing.tsx` | "escrow" survives in 1 heading — remnant of the #16 sweep | Apply the #220 wording ("held safely by Stripe") |
| 30 | LOW | UI/copy | `src/components/UnlockLeadModal.tsx` | "lead" appears in 8 headings/buttons | Rename to what the user recognises |
| 31 | INFO | Tooling | audit suite | The two drift checkers ran nowhere this cycle — not locally (no `SUPABASE_ACCESS_TOKEN`) and not in CI (job skipped) | Provision `SUPABASE_ACCESS_TOKEN` for the audit runner. Allowing `jsr.io`/`deno.land` is worth doing too, but it is local-run convenience only — CI already type-checks the edge functions |
| 32 | INFO | Tooling | `scripts/check-contrast.mjs` | Passes and fails simultaneously with no `.env`; blank routes read as a pass line | Fail fast when `VITE_SUPABASE_URL` is unset |

Closed and re-verified this cycle: **#9** (orphans, #216) · **#26**
(third "In Escrow" label, #215) · the **error-copy class** (#217) · **#16**
escrow wording (#220) · **#13 batch 2** (#219).

## Recommendations

### High — this sprint
1. **Edge-function tests.** This is the only 🔴 and the largest single lever
   left: 2.9 of 10 points sit in one check. `_shared/` already has the pattern
   (5 test files); extending it to the money-path functions is both the score
   move and the best pre-launch insurance.
2. **Provision the drift checkers.** Three checks did not run here, but CI
   covered the edge typecheck. The two drift checkers ran nowhere — a scheduled
   audit that cannot verify deploy drift is measuring less than it reports, and
   that is the gap worth closing with a `SUPABASE_ACCESS_TOKEN`.

### Medium — next sprint
3. Page tests: 0 of 65. Start with the money-facing pages (Payouts, Payments,
   Leads).
4. Continue the standing tracks at their own pace: CSS tranches 3–7, Title-Case
   batches 3+ (admin → legal), and the three baselined nav/copy items (#28–#30,
   all one-liners).

### Low — backlog
5. Lint backlog (#21); the two unused vars at `stripe-webhook:259` are free.
6. Unused indexes (#11) and the auth pool strategy (#12), both post-launch.

Nothing found this cycle blocks go-live. The remaining launch path is
owner-side (`docs/OWNER-TODO.md`).

## Score trend

| Date | Overall | Note |
|---|---|---|
| 2026-07-01 | 85.6% 🟡 | |
| 2026-07-30 | 95.4% 🟢 | pre-copy/CSS measurement — not comparable |
| 2026-08-01 | 89.7% 🟡 | deeper instruments, ~700 new copy findings |
| 2026-08-02 | 93.3% 🟢 | 13 fix PRs + 2 prod DB hardenings |
| **2026-08-03** | **94.3%** 🟢 | 12 PRs; Navigation #9 closed; 2 drift checkers unverified |

## Next recommended action

Write the edge-function test batch, starting with the release path
(`release-escrow`, `auto-release-payments`) where `_shared/escrowReserve.test.ts`
already establishes the harness. It closes the only 🔴, and it is the one
dimension where the score and the actual launch risk point the same way.
