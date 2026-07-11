-- ─────────────────────────────────────────────────────────────────────────────
-- Harden public_vacancies.
--
-- public_vacancies is an INTENTIONAL security-definer view (security_invoker=false):
-- anon cannot read trade_vacancies / profiles / tradie_details directly (all their
-- SELECT policies require `authenticated`), and RLS cannot restrict COLUMNS — so a
-- column-restricted definer view is the only safe way to expose a job-ad-safe subset
-- (no email/phone/address) of OPEN, non-expired vacancies to anonymous /careers
-- visitors. Switching to security_invoker WITHOUT first denormalising the employer
-- fields would force a broad anon read policy on `profiles` and leak PII, so it is
-- deliberately left as-is. (The Supabase `security_definer_view` advisor will keep
-- flagging it — that is a reviewed, accepted exception, not an unpatched leak.)
--
-- The one real issue: the view inherited full write grants (INSERT/UPDATE/DELETE/…)
-- from the schema default privileges. They're inert (a 3-table join view isn't
-- updatable) but shouldn't be granted. Make it explicitly read-only to clients.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_vacancies FROM anon, authenticated;

-- keep the intended access
GRANT SELECT ON public.public_vacancies TO anon, authenticated;

COMMENT ON VIEW public.public_vacancies IS
  'Public, column-restricted, READ-ONLY projection of OPEN trade_vacancies for the anon /careers pages. INTENTIONALLY security_invoker=false: base tables are authenticated-only and RLS cannot restrict columns, so this definer view is the safe way to expose ONLY job-ad fields (no email/phone/address). Reviewed 2026-07-11. Do NOT switch to security_invoker without first denormalising the employer name/business/verified onto trade_vacancies — a naive switch would leak full profiles (PII) to anon.';
