-- Public, read-only view of open vacancies for the crawlable /careers pages.
-- Anonymous visitors can't read trade_vacancies / profiles / tradie_details
-- directly (all SELECT policies require authenticated), and RLS can't restrict
-- columns — so a column-restricted view is the safe way to expose ONLY
-- job-relevant fields (no emails/phones/addresses) to anon.
--
-- Runs with the view owner's rights (security_invoker = false) so it can read
-- the base tables, but only surfaces the columns selected below, and only for
-- open, non-expired listings.
CREATE OR REPLACE VIEW public_vacancies
WITH (security_invoker = false) AS
SELECT
  v.id,
  v.title,
  v.role_type,
  v.description,
  v.trade_category,
  v.location,
  v.employment_type,
  v.pay_min,
  v.pay_max,
  v.pay_period,
  v.pay_note,
  v.required_tickets,
  v.hours,
  v.start_date,
  v.experience_level,
  v.closing_date,
  v.created_at,
  td.business_name AS employer_business_name,
  p.full_name       AS employer_name,
  (p.verification_status = 'verified' OR COALESCE(td.is_verified, false)) AS employer_verified
FROM trade_vacancies v
JOIN profiles p        ON p.id = v.employer_id
LEFT JOIN tradie_details td ON td.profile_id = v.employer_id
WHERE v.status = 'open'
  AND (v.closing_date IS NULL OR v.closing_date >= current_date);

GRANT SELECT ON public_vacancies TO anon, authenticated;
