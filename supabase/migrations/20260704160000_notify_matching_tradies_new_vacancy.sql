-- Fan out an in-app notification to matching tradies when a new open vacancy
-- is posted, so the hiring board has a demand side from day one. Mirrors the
-- existing notify_employer_new_application trigger pattern (SECURITY DEFINER,
-- inserts into notifications with channel 'in_app').
--
-- Matching: tradie_details.trade_category equals the vacancy's trade_category.
-- Skips office/non-trade listings (nothing to match on), never notifies the
-- employer about their own listing, and caps fan-out at 500 as a safety bound.
CREATE OR REPLACE FUNCTION public.notify_matching_tradies_new_vacancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_name text;
BEGIN
  IF NEW.status <> 'open' OR NEW.trade_category IS NULL OR NEW.trade_category IN ('', 'non_trade') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(td.business_name, ''), p.full_name, 'A ConnecTradie business')
    INTO v_employer_name
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = NEW.employer_id;

  INSERT INTO notifications (user_id, title, message, type, channel, metadata, read)
  SELECT
    td.profile_id,
    'New Role In Your Trade',
    v_employer_name || ' is hiring: "' || LEFT(NEW.title, 60) || '"'
      || CASE WHEN COALESCE(NEW.location, '') <> '' THEN ' — ' || NEW.location ELSE '' END,
    'vacancy_match',
    'in_app',
    jsonb_build_object('vacancy_id', NEW.id, 'trade_category', NEW.trade_category),
    false
  FROM tradie_details td
  JOIN profiles p ON p.id = td.profile_id
  WHERE td.trade_category = NEW.trade_category
    AND td.profile_id <> NEW.employer_id
    AND p.role = 'tradie'
  LIMIT 500;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_matching_tradies_new_vacancy ON trade_vacancies;
CREATE TRIGGER trg_notify_matching_tradies_new_vacancy
  AFTER INSERT ON trade_vacancies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_matching_tradies_new_vacancy();
