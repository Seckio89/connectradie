-- Migration: public_tradie_profiles_left_join_details
-- Type: Regression fix for 20260807062807 (caught in review on PR #269)
-- Applied to production 2026-08-07 via MCP apply_migration (version 20260807074531);
-- this file matches the stamped version so `db push` never re-runs it.
--
-- 20260807062807 built list_public_tradies() on an INNER JOIN to tradie_details,
-- on the reasoning that "a profile with no tradie_details is not a listing".
-- That is true for three of the four callers but NOT for the fourth.
--
-- Before the migration, PublicTradieProfile.tsx queried `tradie_details (*)` —
-- a LEFT embed, no `!inner`. A tradie who had claimed the role but not yet
-- filled in their trade details still rendered, just with an empty details
-- panel. On the inner-joined view that same profile returns no row at all, so
-- `maybeSingle()` yields null and the page renders "Profile Not Found".
--
-- The other three callers all required tradie_details before this change and
-- still do, so they are unaffected either way:
--   FindTradies.tsx        `tradie_details!inner(trade_category)`
--   Search.tsx             `.not('tradie_details', 'is', null)`
--   RecommendedTradies.tsx `tradie_details!inner(*)`
--
-- So the join belongs at the CALL SITE, not baked into the view. Switch to a
-- LEFT JOIN and expose td_profile_id so a caller that wants listing-only rows
-- filters on it explicitly — which is the literal equivalent of the
-- `.not('tradie_details','is',null)` guard it replaces.
--
-- No rows are affected today (1 tradie, 0 without a tradie_details row), so
-- this is a latent defect rather than a live outage. It becomes reachable the
-- first time someone completes role selection before trade details.

-- Adding td_profile_id changes the OUT-parameter row type, which CREATE OR
-- REPLACE cannot do — the function has to be dropped. The view depends on it,
-- so that goes first and is rebuilt below.
DROP VIEW IF EXISTS public.public_tradie_profiles;
DROP FUNCTION IF EXISTS public.list_public_tradies();

CREATE FUNCTION public.list_public_tradies()
  RETURNS TABLE (
    id                                 uuid,
    full_name                          text,
    bio                                text,
    avatar_url                         text,
    cover_photo_url                    text,
    suburb                             text,
    public_suburb                      text,
    postcode                           text,
    role                               text,
    is_premium                         boolean,
    verified_trades                    text[],
    declared_trades                    text[],
    verification_status                text,
    license_verified                   boolean,
    abn_verified                       boolean,
    is_identity_verified               boolean,
    call_out_fee                       integer,
    show_callout_fee                   boolean,
    callout_fee_waived_on_proceed      boolean,
    is_emergency_available             boolean,
    team_size                          text,
    service_radius_km                  integer,
    has_phone                          boolean,
    onboarding_completed               boolean,
    stripe_connect_onboarding_complete boolean,
    -- NULL when the tradie has no tradie_details row. This is the listing
    -- predicate: filter `td_profile_id is not null` for listing-only results.
    td_profile_id                      uuid,
    td_business_name                   text,
    td_trade_category                  text,
    td_trade_type                      text,
    td_contractor_type                 text,
    td_bio                             text,
    td_subscription_tier               text,
    td_is_verified                     boolean,
    td_is_insured                      boolean,
    td_is_licensed                     boolean,
    td_hourly_rate                     numeric,
    td_emergency_available             boolean,
    td_insurance_provider              text,
    td_qualifications                  text[],
    td_service_radius_km               integer,
    td_default_call_out_fee_cents      integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.cover_photo_url,
    p.suburb,
    p.public_suburb,
    p.postcode,
    p.role,
    p.is_premium,
    p.verified_trades,
    p.declared_trades,
    p.verification_status,
    p.license_verified,
    p.abn_verified,
    p.is_identity_verified,
    p.call_out_fee,
    p.show_callout_fee,
    p.callout_fee_waived_on_proceed,
    p.is_emergency_available,
    p.team_size,
    p.service_radius_km,
    p.has_phone,
    p.onboarding_completed,
    p.stripe_connect_onboarding_complete,
    td.profile_id,
    td.business_name,
    td.trade_category,
    td.trade_type,
    td.contractor_type,
    td.bio,
    td.subscription_tier,
    td.is_verified,
    td.is_insured,
    td.is_licensed,
    td.hourly_rate,
    td.emergency_available,
    td.insurance_provider,
    td.qualifications,
    td.service_radius_km,
    td.default_call_out_fee_cents
  FROM public.profiles p
  LEFT JOIN public.tradie_details td ON td.profile_id = p.id
  WHERE p.role = 'tradie';
$function$;

REVOKE ALL ON FUNCTION public.list_public_tradies() FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_tradies() TO authenticated, service_role;

CREATE VIEW public.public_tradie_profiles
  WITH (security_invoker = true)
  AS SELECT * FROM public.list_public_tradies();

REVOKE ALL ON public.public_tradie_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_tradie_profiles TO authenticated;

COMMENT ON VIEW public.public_tradie_profiles IS
  'Stranger-safe projection of tradie profiles for discovery, backed by list_public_tradies(). tradie_details is LEFT joined — filter td_profile_id is not null for listing-only results. Never add a column that identifies or contacts a person: no email, phone, address, abn_number, license_number, documents_url or stripe_* id.';
