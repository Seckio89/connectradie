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
npm run check:secrets
npm run check:sinks
npm run check:deps
npm run test:run -- --no-file-parallelism
```
If time allows, also: `npm run typecheck:edge`,
`npm run build && npm run check:contrast:ci`, and
`npm run check:secrets:history` (~10s, scans every blob in every commit, not
just HEAD — the only thing that sees a credential already removed from the
current tree).

`check:secrets`, `check:sinks` and `check:deps` are the security suite,
restored 2026-08-03 after a credential sat in a tracked file for two months
while this audit reported clean. They also run **blocking in CI**, so this run
is the backstop, not the primary catch.

### 2. Pull live-platform signal (read-only)
- Supabase MCP `get_advisors` — note any NEW advisor findings not already
  listed in the latest `AUDIT-REPORT-*.md`. **This is the RLS and auth
  instrument.** It covers RLS-enabled, SECURITY DEFINER and policy findings,
  and it is deliberately not duplicated in a checker: it needs network and
  project credentials, so CI cannot run it on fork PRs. If this step is ever
  removed, RLS coverage goes with it — say so rather than dropping it quietly.
- Supabase `get_logs` for edge functions — scan for error spikes.

### 3. Compare against known state
A finding counts as a REGRESSION only if it is new versus:
- the checker baselines (`.nav-baseline.json`, `.contrast-baseline.json`,
  `.sinks-baseline.json`, `.audit-baseline.json`, typecheck baselines), and
- the open findings in the newest `AUDIT-REPORT-*.md`.
Long-standing known findings are NOT news — do not re-report them.

**`check:secrets` is exempt from this rule.** It has no baseline by design:
every finding is new, and "we already knew about that credential" is not a
reason to stay quiet about a live secret.

### 4. Report
- Everything green / nothing new: **no notification.** Silence means green.
- New regression(s): push notification — which check, what broke, since
  when if determinable, and whether it's Tier A or Tier B per
  `docs/governance/CHANGE-POLICY.md`. Do not fix it; the owner (or a
  day-time session) decides.
- **A `check:secrets` failure is CRITICAL and always notifies**, overriding
  "silence means green" and the Tier judgement. Name the file and the pattern.
  **Never put the matched value in the notification** — say where it is, not
  what it is. The fix is rotation at the issuer first, then removal; deleting
  it from HEAD alone leaves it in history, and this repository is public.

## Guardrails
- Read-only toward the repo: no commits, no file edits, no baseline
  re-baselining (a regression is fixed, never baselined away, per
  `docs/governance/PATCH-RUNBOOK.md`).
- Never run anything against production money paths; the e2e harnesses are
  out of scope for this task.
