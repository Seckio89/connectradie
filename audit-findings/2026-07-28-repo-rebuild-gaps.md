# The repo cannot rebuild production

2026-07-28 · prod `uoqygmizupdpanplpvor` vs a database actually rebuilt from `supabase/migrations`

## Verdict

**Provisioning a fresh Supabase project from this repo does not reproduce
production.** 45 schema objects are missing, and every one of them is reachable
from application code. This is a disaster-recovery gap: if production were lost,
the repo could not rebuild it, and the gaps are silent — nothing in CI, in
`npm run typecheck`, or in `npm run check:columns` detects any of them.

Found by accident while provisioning the e2e project, then confirmed
systematically.

| Class | Missing | Fixed? |
|---|---|---|
| Functions | 3 | ✅ `20260728043000` |
| Tables | 3 | ✅ `20260728044500` |
| Constraint values | 1 | ✅ `20260728093000` |
| **Columns** | **11** across 6 tables | ❌ |
| **RLS policies** | **26** across 15 tables | ❌ |
| Triggers, indexes, defaults, enums, views | **unknown — not checked** | — |

## Root cause

Production's migration history has **331 applied versions**; the repo has **311
files**, and the two sets are near mirror images — ~145 applied versions have no
local file. Prod's carry real clock timestamps (`20260322100713`), the files
carry hand-rounded ones (`20260322100000`, and one impossible `20260726260000` —
hour 26).

The reading that fits: schema was applied through a path that assigns its own
version and does not write a migration file — the dashboard SQL editor, or an
MCP `apply_migration` call. The object landed in prod, the file never landed in
the repo, and nothing compares the two.

## Method

- **Tables and columns** — compared prod's catalogs against the e2e project,
  which was genuinely rebuilt by replaying all 311 migrations. This is the strong
  form of the test: it accounts for later `ALTER`s, unlike grepping migrations.
- **Policies** — compared prod's `pg_policies` against every `CREATE POLICY` name
  in the migrations. Name-based and therefore approximate, but a name that
  appears in prod and in no migration is conclusive.
- **Not checked** — triggers, indexes, column defaults, enums, views, and
  constraints beyond the one found. These need SQL access to the rebuilt
  database, which is not available: the Supabase MCP is scoped to prod's org, and
  `supabase db dump` requires Docker, which is not installed here. **Assume more
  gaps exist in those classes.**

## Missing columns — all 11 are used by application code

`invoice_number` alone appears in 15 files. A rebuilt database returns a
PostgREST error on every query touching these.

| Table | Missing | Files using it |
|---|---|---|
| `jobs` | `calendar_event_id`, `contact_flag_reason`, `contact_flagged`, `parking_available` | 2, 2, 2, 6 |
| `payments` | `invoice_number`, `invoice_ref` | 15, 5 |
| `recurring_jobs` | `auto_accept`, `end_date` | 5, 4 |
| `availability_slots` | `calendar_event_id` | 2 |
| `profiles` | `last_invoice_reminder_email_at` | 1 |
| `recurring_invoices` | `payout_error_message` | 3 |

Note `check:columns` cannot catch this class. It validates code against
`src/types/supabase.ts`, which is generated from **production** — so it confirms
the code matches prod, never that the migrations do.

## Missing RLS policies — 26, across 15 tables

`account_removals`, `client_errors`, `client_sites`, `custom_task_suggestions`,
`fee_audit_anomalies`, `imported_calendar_visits`, `lead_impressions`,
`notifications`, `profile_private`, `profiles`, `quote_templates`,
`saved_payment_methods`, `site_visit_events`, `tradie_details`,
`typing_indicators`.

**All 26 are PERMISSIVE**, which decides the severity: Postgres OR's permissive
policies, so their absence *narrows* access. A rebuilt database fails closed —
features break rather than data leaking. That is the good direction, but it means
a rebuild would silently lose access to private profile data, saved payment
methods, client sites and quote templates.

Two of these sit on tables where the effect is worth calling out:
`profile_private` (three policies — the only ones granting owners access to their
own bank details) and `saved_payment_methods`. On a rebuild, those tables would
have RLS enabled and no way in.

## Recommended fix

1. **Two migrations** — one adding the 11 columns with prod's exact types,
   defaults and nullability; one recreating the 26 policies from prod's
   `pg_policies` definitions. Both idempotent (`ADD COLUMN IF NOT EXISTS`,
   `DROP POLICY IF EXISTS` + `CREATE`), so both are no-ops against production.
   Follow the pattern of the three already landed.
2. **Cover the unchecked classes** — triggers, indexes, defaults, enums, views.
   Requires SQL access to a rebuilt database; the cheapest route is installing
   Docker so `supabase db dump` works, then diffing two dumps directly.
3. **Stop the recurrence.** The gap exists because objects reached prod without a
   migration file. A drift check comparing prod's catalogs to a rebuilt database
   would catch it, but it needs prod credentials, so it belongs as a scheduled or
   manual script rather than a CI job. Without something like it, this recurs
   every time someone edits schema outside a migration.

## Why this matters beyond DR

The e2e project is now the thing that proves money-path changes work. It is built
from these migrations. Every gap between it and production is a way for the E2E
to pass against a schema that is not the one running in production — which is
exactly how `payments_status_check` slipped through: the constraint blocked
`status='released'`, `release-escrow` swallowed the error, and the run looked
fine until the payout was inspected directly.
