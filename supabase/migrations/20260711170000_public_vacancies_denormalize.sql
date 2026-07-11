-- ─────────────────────────────────────────────────────────────────────────────
-- Denormalise the employer snapshot onto trade_vacancies so public_vacancies no
-- longer needs a profiles / tradie_details join. That lets the view be
-- security_invoker=on (clears the CRITICAL security_definer_view advisor) WITHOUT
-- exposing PII: anon reads only OPEN trade_vacancies rows (job-ad columns only —
-- no email/phone/address, which live on profiles and are never exposed).
-- The snapshot (business name, employer name, verified badge) is kept fresh by
-- triggers on insert and on the employer's profile / tradie_details changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Snapshot columns.
ALTER TABLE trade_vacancies
  ADD COLUMN IF NOT EXISTS employer_business_name text,
  ADD COLUMN IF NOT EXISTS employer_name text,
  ADD COLUMN IF NOT EXISTS employer_verified boolean NOT NULL DEFAULT false;

-- 2. Populate on insert / employer change. SECURITY INVOKER is fine — the
--    employer can already read their own profile + tradie_details under RLS.
CREATE OR REPLACE FUNCTION public.set_vacancy_employer_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  SELECT td.business_name,
         p.full_name,
         (p.verification_status = 'verified' OR COALESCE(td.is_verified, false))
    INTO NEW.employer_business_name, NEW.employer_name, NEW.employer_verified
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = NEW.employer_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_vacancy_employer_snapshot ON trade_vacancies;
CREATE TRIGGER trg_vacancy_employer_snapshot
  BEFORE INSERT OR UPDATE OF employer_id ON trade_vacancies
  FOR EACH ROW EXECUTE FUNCTION public.set_vacancy_employer_snapshot();

-- 3. Keep OPEN vacancies' snapshot fresh when the employer's name / business /
--    verification changes. SECURITY DEFINER because this can be triggered by an
--    admin or a service-role verification job, not just the employer.
CREATE OR REPLACE FUNCTION public.refresh_open_vacancy_employer_snapshot(p_employer uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE trade_vacancies v
  SET employer_business_name = td.business_name,
      employer_name = p.full_name,
      employer_verified = (p.verification_status = 'verified' OR COALESCE(td.is_verified, false))
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = p_employer AND v.employer_id = p_employer AND v.status = 'open';
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_open_vacancy_employer_snapshot(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.on_profile_change_refresh_vacancies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    PERFORM public.refresh_open_vacancy_employer_snapshot(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_profile_refresh_vacancies ON profiles;
CREATE TRIGGER trg_profile_refresh_vacancies
  AFTER UPDATE OF full_name, verification_status ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_change_refresh_vacancies();

CREATE OR REPLACE FUNCTION public.on_tradie_details_change_refresh_vacancies()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.business_name IS DISTINCT FROM OLD.business_name
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    PERFORM public.refresh_open_vacancy_employer_snapshot(NEW.profile_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_tradie_details_refresh_vacancies ON tradie_details;
CREATE TRIGGER trg_tradie_details_refresh_vacancies
  AFTER UPDATE OF business_name, is_verified ON tradie_details
  FOR EACH ROW EXECUTE FUNCTION public.on_tradie_details_change_refresh_vacancies();

-- These are trigger-only functions; they should never be callable via RPC.
REVOKE EXECUTE ON FUNCTION public.on_profile_change_refresh_vacancies()        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_tradie_details_change_refresh_vacancies() FROM anon, authenticated, public;

-- 4. Backfill existing rows.
UPDATE trade_vacancies v
SET employer_business_name = td.business_name,
    employer_name = p.full_name,
    employer_verified = (p.verification_status = 'verified' OR COALESCE(td.is_verified, false))
FROM profiles p
LEFT JOIN tradie_details td ON td.profile_id = p.id
WHERE p.id = v.employer_id;

-- 5. Recreate the view WITHOUT joins, as security_invoker (RLS of the caller).
CREATE OR REPLACE VIEW public.public_vacancies WITH (security_invoker = on) AS
SELECT
  id, title, role_type, description, trade_category, location, employment_type,
  pay_min, pay_max, pay_period, pay_note, required_tickets, hours, start_date,
  experience_level, closing_date, created_at,
  employer_business_name, employer_name, employer_verified
FROM trade_vacancies
WHERE status = 'open' AND (closing_date IS NULL OR closing_date >= current_date);
ALTER VIEW public.public_vacancies SET (security_invoker = on);
GRANT SELECT ON public.public_vacancies TO anon, authenticated;

-- 6. Anon can read OPEN, non-expired vacancies directly (required by the
--    security_invoker view). Exposed columns are all non-PII job-ad fields.
GRANT SELECT ON public.trade_vacancies TO anon;
DROP POLICY IF EXISTS "Anyone can view open vacancies" ON trade_vacancies;
CREATE POLICY "Anyone can view open vacancies" ON trade_vacancies
  FOR SELECT TO anon
  USING (status = 'open' AND (closing_date IS NULL OR closing_date >= current_date));

COMMENT ON VIEW public.public_vacancies IS
  'Public READ-ONLY view of OPEN trade_vacancies for the anon /careers pages. security_invoker=on; employer business/name/verified are denormalised onto trade_vacancies (kept fresh by triggers) so no profiles/tradie_details join is needed and no PII is exposed. Anon reads open rows via the "Anyone can view open vacancies" policy.';
