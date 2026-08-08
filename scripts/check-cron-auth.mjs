#!/usr/bin/env node
/**
 * check:cron-auth — fails when a cron migration authenticates with a GUC that
 * does not exist.
 *
 * WHY THIS EXISTS
 * Eight migrations schedule pg_cron jobs like this:
 *
 *   'Bearer ' || current_setting('app.settings.service_role_key', true)
 *
 * `app.settings.service_role_key` is set nowhere on this database — not on the
 * database, not on a role. current_setting(..., true) returns NULL, the header
 * collapses to 'Bearer ', and the edge function answers 401.
 *
 * Production still works only because someone repaired the live jobs by hand to
 * read the key from the vault. The files were never updated, so a rebuild from
 * supabase/migrations would produce a full set of crons that authenticate with
 * nothing — escrow release, recurring payouts, fee invoicing, licence expiry,
 * reminders — every one of them reporting success.
 *
 * That last part is what makes this worth a blocking check rather than a note.
 * pg_net queues the request and returns a row id, so cron.job_run_details
 * records "succeeded" no matter what the eventual HTTP status is. A cron broken
 * this way is indistinguishable from a working one until someone notices the
 * work is not happening — which, for the sweep cron, was one hour, and only
 * because it was being watched at the time.
 *
 * 20260807051518 re-scheduled every HTTP cron from one canonical definition
 * using the vault. This stops the dead form coming back: migrations are
 * append-only, so the eight originals still sit in the tree waiting to be
 * copied by the next person adding a cron.
 *
 *   node scripts/check-cron-auth.mjs
 *
 * Exit: 0 clean, 1 when a non-grandfathered migration uses the dead GUC.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const DEAD_GUC = 'app.settings.service_role_key';
const LIVE_FORM = 'vault.decrypted_secrets';

/**
 * The originals. Every one is superseded by 20260807051518, which re-schedules
 * the jobs they create. They cannot be edited — migrations are append-only —
 * so they are named here rather than silently skipped, and the list must not
 * grow.
 */
const GRANDFATHERED = new Set([
  '20260212002740_add_expired_status_and_license_cron.sql',
  '20260313040000_add_recurring_cron.sql',
  '20260313060000_add_auto_release_cron.sql',
  '20260315100000_add_session_confirmation_flow.sql',
  '20260315110000_add_job_notification_tracking.sql',
  '20260319220000_add_auto_invoice_cron.sql',
  '20260728205845_schedule_credential_expiry_sweep.sql',
  '20260807045901_connect_balance_sweep.sql',
]);

/** Strip `-- …` line comments so prose ABOUT the dead form is not a finding. */
function stripComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      // Naive but sufficient here: no migration in this tree puts `--` inside a
      // string literal on a line that also schedules a cron.
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

const problems = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  if (GRANDFATHERED.has(file)) continue;

  const sql = stripComments(readFileSync(join(DIR, file), 'utf8'));
  if (!sql.includes(DEAD_GUC)) continue;

  problems.push({
    file,
    why: `authenticates a cron with current_setting('${DEAD_GUC}'), which is set nowhere on this database`,
    fix: `read the key from the vault instead — see 20260807051518_cron_auth_from_vault.sql:\n` +
      `        'Bearer ' || (SELECT decrypted_secret FROM ${LIVE_FORM}\n` +
      `                      WHERE name = 'service_role_key' LIMIT 1)`,
  });
}

if (!problems.length) {
  console.log(`cron auth clean (${GRANDFATHERED.size} superseded file(s) grandfathered).`);
  process.exit(0);
}

console.error(`${problems.length} migration(s) schedule a cron that cannot authenticate:\n`);
for (const p of problems) {
  console.error(`  ${DIR}/${p.file}`);
  console.error(`      ${p.why}`);
  console.error(`      ${p.fix}\n`);
}
console.error(
  'A cron broken this way still reports "succeeded": pg_net queues the request\n' +
    'and returns a row id before the 401 ever arrives. Nothing downstream will\n' +
    'tell you the job did not run.',
);
process.exit(1);
