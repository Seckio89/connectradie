-- Migration: verification_badges_and_licence_required
-- Type: ALTER (trade_categories) + public read function
-- Description:
--   1. trade_categories.licence_required — whether a trade needs a state licence
--      at launch (drives the onboarding "Trade licence" step; cleaning = false).
--   2. get_tradie_verification_badges(uuid) — the ONLY public read of the two
--      verification tables: booleans, a state code and an expiry month. Never a
--      licence number, never an ABN. The public profile page calls this for the
--      "GST registered" and "Licence verified" badges.

-- ============================================================
-- 1. trade_categories.licence_required
-- ============================================================
ALTER TABLE public.trade_categories
  ADD COLUMN IF NOT EXISTS licence_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trade_categories.licence_required IS
  'True when the trade needs a state-issued licence before the tradie can be marked licence-verified. Mirrors requiresLicense in src/lib/tradeCategories.ts — keep both in step.';

-- Backfill from the same list as TRADE_CATEGORIES.requiresLicense. Names in this
-- table are the raw category names (e.g. 'air_conditioning', 'pest_control'), so
-- match on both the underscore and hyphen spellings.
UPDATE public.trade_categories
   SET licence_required = true
 WHERE replace(lower(name), '_', '-') IN (
   'plumber', 'electrician', 'builder', 'roofer', 'pest-control', 'air-conditioning',
   'demolition', 'bricklayer', 'arborist', 'pool-builder', 'waterproofing', 'scaffolder',
   'solar', 'security', 'bathroom-renovator', 'kitchen-renovator', 'hvac', 'fire-safety',
   'hot-water-service', 'gas-fitting'
 );

-- ============================================================
-- 2. get_tradie_verification_badges — public, column-limited read
-- ============================================================
-- SECURITY DEFINER because both source tables are RLS-scoped to self/admin. The
-- return list IS the exposure: add a column here and it is public. STABLE so
-- PostgREST can call it with GET.
CREATE OR REPLACE FUNCTION public.get_tradie_verification_badges(p_tradie_id uuid)
RETURNS TABLE (
  abn_verified          boolean,
  gst_registered        boolean,
  licence_verified      boolean,
  licence_state         text,
  licence_expiry_month  text     -- 'YYYY-MM' of the LATEST verified, unexpired licence
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(bv.status = 'verified', false)                       AS abn_verified,
    COALESCE(bv.status = 'verified' AND bv.gst_registered, false)  AS gst_registered,
    (lv.id IS NOT NULL)                                            AS licence_verified,
    lv.state_code                                                  AS licence_state,
    CASE WHEN lv.expiry_date IS NULL THEN NULL
         ELSE to_char(lv.expiry_date, 'YYYY-MM') END               AS licence_expiry_month
  FROM (SELECT p_tradie_id AS id) t
  LEFT JOIN public.business_verifications bv ON bv.user_id = t.id
  LEFT JOIN LATERAL (
    SELECT l.id, l.state_code, l.expiry_date
      FROM public.licence_verifications l
     WHERE l.user_id = t.id
       AND l.status = 'verified'
       AND (l.expiry_date IS NULL OR l.expiry_date >= current_date)
     ORDER BY l.reviewed_at DESC NULLS LAST
     LIMIT 1
  ) lv ON true;
$$;

REVOKE ALL ON FUNCTION public.get_tradie_verification_badges(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_tradie_verification_badges(uuid) TO anon, authenticated, service_role;
