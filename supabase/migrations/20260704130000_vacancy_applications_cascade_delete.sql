-- Allow an employer to delete their own vacancy even when it has applications.
-- The vacancy_applications -> trade_vacancies FK had no ON DELETE action, so a
-- delete would fail with a foreign-key violation. Recreate it with CASCADE so a
-- vacancy's applications are removed with it (the referential action bypasses
-- RLS, which is what we want — there is no client delete policy on applications).
ALTER TABLE vacancy_applications
  DROP CONSTRAINT IF EXISTS vacancy_applications_vacancy_id_fkey,
  ADD CONSTRAINT vacancy_applications_vacancy_id_fkey
    FOREIGN KEY (vacancy_id) REFERENCES trade_vacancies(id) ON DELETE CASCADE;
