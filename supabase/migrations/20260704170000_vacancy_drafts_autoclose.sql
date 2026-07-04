-- Phase 4 of the hiring work: drafts + auto-close.
--
-- • status gains 'draft' — employers can save a listing without publishing.
--   Existing RLS already keeps drafts private (SELECT policy: status='open'
--   OR employer_id = auth.uid()), and the public_vacancies view + in-app
--   browse/stats all filter on status='open'.
-- • Publishing a draft (draft -> open) fires the same matching-tradie
--   notification as posting a new open listing. Reopening a closed listing
--   deliberately does NOT re-notify.
-- • A daily pg_cron job closes open listings whose closing_date has passed,
--   so the in-app status matches what the public pages already hide.

ALTER TABLE trade_vacancies
  DROP CONSTRAINT trade_vacancies_status_check,
  ADD CONSTRAINT trade_vacancies_status_check CHECK (status IN ('open','closed','draft'));

DROP TRIGGER IF EXISTS trg_notify_matching_tradies_published_vacancy ON trade_vacancies;
CREATE TRIGGER trg_notify_matching_tradies_published_vacancy
  AFTER UPDATE OF status ON trade_vacancies
  FOR EACH ROW
  WHEN (OLD.status = 'draft' AND NEW.status = 'open')
  EXECUTE FUNCTION public.notify_matching_tradies_new_vacancy();

-- 14:05 UTC ≈ just after midnight AEST. cron.schedule upserts by job name.
SELECT cron.schedule(
  'auto-close-expired-vacancies',
  '5 14 * * *',
  $job$
    UPDATE trade_vacancies
    SET status = 'closed', updated_at = now()
    WHERE status = 'open' AND closing_date IS NOT NULL AND closing_date < current_date
  $job$
);
