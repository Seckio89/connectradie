---
name: nightly-code-audit
description: Weekly checker-suite run. Always reports — green, regressed, or unable to complete. A missing report means the run never happened.
---

You are running the weekly code audit for ConnecTradie. Detection only —
you never fix anything, never commit, never open PRs.

The directory name still says `nightly-code-audit`: the Routine's prompt
references this path literally, so it stays. The cadence lives in the Routine,
not here.

⚠️ **The Routine's stored prompt duplicates these instructions and says its own
rules "apply either way".** So it, not this file, is what a fired session
actually obeys where the two differ. Any change here has to be mirrored into the
Routine prompt via `update_trigger`, or it does nothing. That has already gone
wrong twice: the prompt sat on "silence means green" and enumerated a command
list that omitted the security suite entirely.

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

### 4. Report — always send exactly one notification

**Every run ends with a notification. There is no silent outcome.**

This replaced "silence means green", which could not be told apart from a run
that never happened. On 2026-08-03 the owner asked why the audit had not run;
it had, 2h15m earlier, and had stayed quiet because everything passed. Nothing
distinguished that from a crashed `npm ci`, a container that never started, or
a session that died mid-suite. An all-clear you cannot tell from a corpse is
not an all-clear — the same false assurance as the security scanner that
reported "no exposed secrets" for two months while switched off.

Three outcomes, and one of them always fires:

1. **Completed, nothing new** — one terse line naming **which checks actually
   ran and their headline numbers**, e.g.
   `Audit green 2026-08-03 · typecheck 0 · columns clean · nav 0 new · ink/tokens clean · secrets clean · sinks/deps baseline · 962 tests`.
   The counts are the point. "All green" from a run that executed two of the
   eight checkers is a worse lie than silence, so a check that did not run is
   named as `not run`, never omitted and never counted as a pass.
2. **Completed, regression found** — which check, what broke, since when if
   determinable, and Tier A or Tier B per `docs/governance/CHANGE-POLICY.md`.
   Do not fix it; the owner (or a day-time session) decides.
3. **Could not complete** — `npm ci` failed, the repo would not clone, a
   checker crashed rather than reported, or you ran out of time. Say so
   explicitly and name the step that stopped you. This is a distinct outcome
   from "found a regression": the platform's state is *unknown*, not bad, and
   reporting it as green would be the failure this section exists to prevent.

Absence of any notification now means the Routine itself never fired or the
container never came up — which is actionable, and visible, in a way that
silence-as-success never was. `list_triggers` shows `last_fired_at` if you
need to confirm the schedule end of it.
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
