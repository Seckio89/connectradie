# Migration ledger drift — audited 2026-08-06

**Finding: the drift is benign. Nothing is missing from production.** But it
makes `supabase db push` unsafe to run, and nothing was stopping it growing.

## The drift

Production's ledger records a version per applied migration. This repo names
files with their own stamp. The two disagree: of 340 files, 179 carry
hand-rounded stamps (`20260805010000`) where production recorded the real clock
(`20260805010933`).

Against production's `supabase_migrations.schema_migrations`, those 179 are:

| | count | |
|---|---|---|
| version present in ledger | 57 | includes at least one collision — repo's `20260313020000` is `tradie_availability`, production's is `add_recurring_service_subtype` |
| absent, name matches a ledger entry | 79 | same migration, different stamp |
| absent, no name match | 43 | investigated below |

The repo also contains one internal duplicate: `20260728093000` names both
`fee_charge_kind_and_payout_anchor.sql` and `payments_status_allow_released.sql`.

## The 43, resolved

They are not missing. They cluster in one contiguous band (2026-03-21 →
2026-06-11) plus a single outlier, and production has **46 ledger entries with
a NULL name in exactly that band** — which is why nothing name-matched. The
name was never recorded, so no name could match.

Verified against live schema rather than inferred. Every object those 43 files
create is present in production:

- 12 columns across `jobs`, `payments`, `profiles`, `quotes`, `recurring_jobs`,
  `recurring_sessions`, `reviews` — all present
- 3 tables (`conflict_dismissals`, `lead_impressions`, `saved_payment_methods`)
  — all present
- the outlier `20260725170000_fee_audit_override_check` defines
  `check_v21_fee_invariants()` — present (production recorded it as
  `20260725011552 fee_audit_override_consistency`)

## Why it matters anyway

`supabase db push` reads ~122 already-applied migrations as pending. Of the
full set, **73 files carry `CREATE POLICY` with no `DROP POLICY IF EXISTS`
guard** and **68 carry `INSERT INTO` seeds**. A push against production either
aborts on the first existing policy or duplicates seed data on a live
marketplace before it stops. It should not be run until the history is
reconciled.

The from-scratch replay path — the one disaster recovery depends on — is
unaffected and works.

## Cause

Named already in the header of `scripts/check-schema-drift.mjs`: schema reaches
production through paths that assign their own version and write no file (the
dashboard SQL editor, an MCP `apply_migration`). `20260806072210` arrived that
way this week.

## What was done

- `scripts/check-migration-stamps.mjs` + `npm run check:migrations`, blocking in
  the **DB Columns** CI job. Rejects a *new* migration whose stamp is
  hand-rounded, impossible, duplicated, or out of order. Existing files are
  grandfathered in `.migration-stamp-baseline.json`; credential-free, so it runs
  on forks.

## Still open

- **`SUPABASE_ACCESS_TOKEN` is not set as a repository secret**, so the
  `Drift (schema + edge)` CI job has never executed a single time. It is the
  check that would have caught the 45 missing objects the 2026-07-28 audit
  found by hand. Setting it is the highest-value remaining action here.
- Reconciling the 179 historical stamps, if `db push` is ever wanted as a
  deployment path. Not attempted: it needs per-file evidence, and marking a
  colliding version as applied would permanently hide a migration production
  never ran.
