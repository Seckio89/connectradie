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



## D5 — Merge overlapping database access policies (audit finding #8)

**What:** Two tables (`cancellation_policies`, `profile_private`) have
overlapping permission rules. Merging them makes the database marginally
faster and the security posture easier to reason about.
**Pros:** Cleaner security model; small performance gain; closes a MEDIUM
finding.
**Cons:** Touching access rules always carries risk — needs the full
migration verification ritual (staging first, RLS proof).
**Risk if we don't:** None immediate; audit debt.
**Effort:** Small, but high-care (money-adjacent tier).
**Recommendation:** Approve, batched with the next migration.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D6 — Tighten two publicly readable tables (audit finding #10)

**What:** `tradie_details` and `platform_config` are readable without login.
Some of that is intentional (public tradie profiles need it); the question is
whether every column in them should be public.
**Pros:** Less data exposed to scrapers/competitors.
**Cons:** Over-tightening breaks the public search/profile pages for
logged-out visitors (already a known weak spot); needs a column-by-column
review, not a blanket flip.
**Risk if we don't:** Low — no secrets are in these tables today.
**Effort:** Medium (column audit + migration).
**Recommendation:** Defer until the profiles-RLS work (already planned as
"NEXT UP" in project notes) — do them together, in the right order.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

---

## Decided

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
