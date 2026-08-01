# Decisions pending — the owner's yes/no list

This is the only place you (the owner) ever have to say yes or no. Each item
is a Tier B change under [CHANGE-POLICY.md](CHANGE-POLICY.md): nothing here
gets built until you tick a box. Tick it in this file, or just tell Claude
"approve D3" / "reject D3" in chat.

When an item is decided, it moves to the **Decided** section at the bottom
with the date.

**Template for new entries:**

> **What:** one sentence, plain English.
> **Why it matters:** what breaks or is risked today.
> **Pros / Cons / Risk if we don't / Effort / Recommendation.**
> **Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

---




---

## Decided

- **D6 — Tighten publicly readable tables: APPROVED 2026-08-01, applied to
  production the same day** (migration 20260801100807, repo record in
  PR #213). Investigation first: `tradie_details` was never anon-readable
  (grant without policy = zero rows) — the dead grant is revoked so future
  anon access must be a deliberate two-step. `platform_config` WAS
  world-readable; verified no client code reads it and every edge-fn reader
  uses the service role, then dropped the public policy + grants. Proven by
  post-apply grant inspection and a live logged-in /search smoke. The
  tradie_details column-split stays with the profiles-RLS project.
  Finding #10 closed.

- **D5 — Merge overlapping RLS policies: APPROVED 2026-08-01 — already
  resolved, no migration needed.** Verified against the LIVE database
  (pg_policies): both `cancellation_policies` and `profile_private` now
  carry exactly one permissive policy per action (admin-only writes;
  single owner-or-admin rules; one public read), and the current Supabase
  advisors raise no multiple-permissive-policies warning. The overlap was
  fixed by an earlier migration; the audit finding had gone stale.
  Finding #8 closed with zero risk taken.

- **D4 — Chart colours onto tokens: APPROVED 2026-08-01, and mostly already
  done.** Investigation showed the '8 files with hex' were 7 files whose
  comments merely mention old values (the palettes were tokenised in earlier
  PRs) plus one live literal — SiteCalendar's `#eee` day-row divider, fixed
  in PR #212 (`var(--line-soft)`). Finding #7 is closed. New backlog note
  from the same rows: v1 ramp classes colour the job-status accents; mapping
  them onto the v2 semantic colours is a future design decision.

- **D3 — mobile-responsive.css phased retirement: APPROVED 2026-08-01.**
  Running as a 7-tranche track, one tranche per PR with 375px verification —
  plan at `docs/audit/MOBILE-CSS-RETIREMENT.md`. Tranche 1 (breadcrumb
  catch-all selectors defused) shipped as PR #211 the same day; the dead-rule
  deletion had already landed as PR #204.

- **D7 — Nightly code audit: APPROVED 2026-08-01.** Registered as a cloud
  routine running 3:00am Sydney nightly. Detection only — it runs the
  checker suite against the baselines and the newest audit report, sends a
  push notification only for a NEW regression, and stays silent when green.

- **D2 — One source of truth for Terms and Privacy: APPROVED 2026-08-01.**
  PR #207 deletes the static HTML duplicates. The audit found they were
  worse than a drift risk: on Vercel the static file wins before the SPA
  rewrite, so direct visits to /terms and /privacy were already serving the
  old light-themed copies. Once merged, both URLs render the React pages.

- **D1 — Branch protection on `master`: APPROVED 2026-08-01.** Applied the
  same day via the GitHub API: merges (and direct pushes) to `master` now
  require the Type Check, Tests, Build, DB Columns and Navigability CI
  checks to pass. CI now gates the Vercel deploy instead of racing it.
