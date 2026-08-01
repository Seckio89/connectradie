# Go-live runbook — the master sequence

One page that orders everything between "code done" and "fully live",
including the Android app. It **links** the detailed checklists rather than
repeating them; each step says who does it. Owner steps are restated in plain
English in [OWNER-TODO.md](OWNER-TODO.md).

Status baseline (2026-08-01): all code and config work is done. What remains
is dashboard/console work (owner), one manual click-through, and the staged
cutover below.

| Legend | |
|---|---|
| 👤 Owner | needs your dashboards/credentials — agents must not do these |
| 🤖 Agent | Claude does it and shows proof |
| 👥 Both | agent prepares, owner clicks the final button |

## Stage 1 — T-7 days (start now; some steps have multi-day review queues)

| # | Step | Who | Detail |
|---|---|---|---|
| 1.1 | Submit Google OAuth consent screen for verification | 👤 | Google's review takes days–weeks — this is why it's first. Copy + logo already prepared. [OWNER-TODO.md §1](OWNER-TODO.md) |
| 1.2 | Full audit green: no unresolved Tier-A regressions | 🤖 | `AUDIT-REPORT-2026-08-01.md`; Tier-A fix PRs merged |
| 1.3 | Decide the launch-blocking items in [governance/DECISIONS-PENDING.md](governance/DECISIONS-PENDING.md) | 👤 | Minimum: D1 (branch protection). Others can wait |
| 1.4 | Money-path e2e pass on the test project | 🤖 | `docs/e2e-verification-runbook.md`; `npm run e2e:doctor` then the harnesses |
| 1.5 | Off-app invoicing click-through (the one remaining manual verification) | 👥 | Logged in as the test tradie: ClientDetail → "Send invoice" → email received → pay link works |
| 1.6 | Android: register release SHA-1 with Google Sign-In | 👤 | [android-release-checklist.md §3](android-release-checklist.md) — needed before any Play build is testable |

## Stage 2 — T-1 day (the Stripe cutover)

Follow [stripe-go-live-checklist.md](stripe-go-live-checklist.md) top to
bottom. Summary of who does what:

| # | Step | Who |
|---|---|---|
| 2.1 | Prerequisites check (§0) | 👥 |
| 2.2 | Swap the secret key into Supabase secrets (§1) | 👤 — agents never handle live keys |
| 2.3 | Swap publishable key + price IDs, redeploy frontend (§2) | 👥 — owner sets Vercel env, agent verifies the build picked it up |
| 2.4 | Create the live webhook + signing secret (§3) | 👤 sets it, 🤖 verifies the endpoint responds and rejects unsigned calls |
| 2.5 | Connect re-onboarding for the live platform account (§4) | 👤 |

## Stage 3 — T-0 (launch day)

| # | Step | Who |
|---|---|---|
| 3.1 | Run [launch-day-smoke-checklist.md](launch-day-smoke-checklist.md) end to end (~45–60 min, ordered to fail early) | 👥 — agent drives what it can, owner does the real-money §2/§3 transactions |
| 3.2 | First live transaction verified before announcing (stripe checklist §5) | 👤 |
| 3.3 | CSP stays **report-only** today — flipping to enforce is deliberately not a launch-day action | — |

## Stage 4 — T+2 to T+7 (stabilise, then expand)

| # | Step | Who |
|---|---|---|
| 4.1 | 48-hour monitoring loop (smoke checklist, bottom section): Sentry, Stripe events, Supabase logs, 2–3× per day | 👥 |
| 4.2 | Review CSP violation reports; if clean, agent PRs the enforce-mode change, owner approves | 👥 — Tier B |
| 4.3 | Play Console: store listing, background-location disclosure, submit for review | 👤 — [android-release-checklist.md §9](android-release-checklist.md) |
| 4.4 | Revisit unused-index cleanup (audit finding #11) once real traffic shapes the query patterns | 🤖 — Tier B entry when ready |
| 4.5 | Weekly rhythm begins: growth-scan recommendations Mondays, decisions ticked, Tier-A PRs merged | 👤 ~10 min/week — [OWNER-TODO.md §6](OWNER-TODO.md) |

## Rollback

Stripe cutover is reversible at every step until the first live charge:
swap the keys back (stripe checklist §6). After live charges exist, never
swap back — fix forward; refunds go through `process-refund`, not the
dashboard.
