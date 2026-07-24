-- Migration: fix_license_expiry_cron_wrong_project
-- Description: Repoint check-license-expiry-daily at THIS project and take its
--              auth from the vault, replacing a hardcoded service-role JWT.
--
-- WHAT WAS WRONG
-- --------------
-- The job called:
--     https://ymxbyxhvhcelwqufhyob.supabase.co/functions/v1/check-license-expiry
-- That is a DIFFERENT Supabase project. This project is uoqygmizupdpanplpvor.
--
-- It also carried a service-role JWT for that other project inline in the cron
-- command, so the credential sat in plaintext in cron.job.command — readable by
-- anyone who can select from that table.
--
-- Because net.http_post is fire-and-forget, cron.job_run_details recorded
-- "succeeded" on all 148 runs regardless: that status only reflects whether the
-- SQL statement ran, never whether the function was reached. Licence-expiry
-- checks have therefore never actually run for this project.
--
-- This was the one job that migration 20260724100000 (cron auth → vault) did not
-- convert, because it did not match the broken-GUC pattern the others shared —
-- it was broken a different way. Every other cron is already on the vault secret
-- and returning 200.
--
-- ⚠️  FOLLOW-UP (not something SQL can do): the exposed key belongs to project
--     ymxbyxhvhcelwqufhyob. If that project still exists, ROTATE its service-role
--     key — it has been sitting in this database in cleartext. Rotating it here
--     is not possible and not sufficient; it must be done in that project.
--
-- PREREQUISITE (verified before writing this): the vault secret exists —
--     select name from vault.decrypted_secrets where name = 'service_role_key';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-license-expiry-daily') THEN
    PERFORM cron.unschedule('check-license-expiry-daily');
  END IF;

  PERFORM cron.schedule(
    'check-license-expiry-daily',
    '0 17 * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://uoqygmizupdpanplpvor.supabase.co/functions/v1/check-license-expiry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- From the vault, never inline: a key written into cron.job.command is
        -- stored in cleartext and survives in the job definition indefinitely.
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'service_role_key' LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
    $cmd$
  );
END;
$$;

-- ============================================================
-- VERIFICATION (run manually after applying)
-- ============================================================
-- No cron should reference the foreign project or an inline key:
--   select jobname from cron.job
--   where command like '%ymxbyxhvhcelwqufhyob%'
--      or command like '%Bearer eyJ%';
--   -- expect: 0 rows
--
-- Every function-calling cron should use the vault:
--   select jobname, command like '%vault.decrypted_secrets%' as uses_vault
--   from cron.job where command like '%functions/v1/%';
--
-- Confirm real 2xx responses (job_run_details is NOT proof — see header):
--   select status_code, count(*), max(created)
--   from net._http_response group by status_code order by max(created) desc;
