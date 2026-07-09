/*
  # Payout observability cron + payout-cron reproducibility

  Schedules the daily payout-reconciliation sweep (read-only detection + admin
  alert). Also (re)declares the two pre-existing payout crons here so the whole
  payout schedule is reproducible from version control — previously
  `auto-release-recurring-payouts-hourly` was scheduled only via the dashboard
  (audit finding: cron not in VCS). cron.schedule upserts by name, so
  re-declaring the existing jobs with their current definitions is a no-op.
*/

-- Daily reconciliation + admin alert (08:00 AEST = 22:00 UTC).
select cron.schedule(
  'payout-reconciliation-daily',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/payout-reconciliation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Hourly recurring-invoice payout sweep (transfer + bank-payout stages).
select cron.schedule(
  'auto-release-recurring-payouts-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/auto-release-recurring-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
