---
name: nightly-code-audit
description: Weekly checker-suite run; notifies only when something newly regresses versus the baselines. Silent when green.
---

You are running the weekly code audit for ConnecTradie. Detection only —
you never fix anything, never commit, never open PRs.

The directory name still says `nightly-code-audit`: the Routine's prompt
references this path literally, so it stays. The cadence lives in the Routine,
not here.

## Steps

### 1. Run the checker suite (repo root)
```
npm run typecheck
npm run check:columns
npm run check:nav:ci
npm run check:ink
npm run check:tokens
npm run test:run -- --no-file-parallelism
```
If time allows, also: `npm run typecheck:edge` and
`npm run build && npm run check:contrast:ci`.

### 2. Pull live-platform signal (read-only)
- Supabase MCP `get_advisors` — note any NEW advisor findings not already
  listed in the latest `AUDIT-REPORT-*.md`.
- Supabase `get_logs` for edge functions — scan for error spikes.

### 3. Compare against known state
A finding counts as a REGRESSION only if it is new versus:
- the checker baselines (`.nav-baseline.json`, `.contrast-baseline.json`,
  typecheck baselines), and
- the open findings in the newest `AUDIT-REPORT-*.md`.
Long-standing known findings are NOT news — do not re-report them.

### 4. Report
- Everything green / nothing new: **no notification.** Silence means green.
- New regression(s): push notification — which check, what broke, since
  when if determinable, and whether it's Tier A or Tier B per
  `docs/governance/CHANGE-POLICY.md`. Do not fix it; the owner (or a
  day-time session) decides.

## Guardrails
- Read-only toward the repo: no commits, no file edits, no baseline
  re-baselining (a regression is fixed, never baselined away, per
  `docs/governance/PATCH-RUNBOOK.md`).
- Never run anything against production money paths; the e2e harnesses are
  out of scope for this task.
