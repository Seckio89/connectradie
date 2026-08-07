-- Migration: public_tradie_discovery_without_definer_view
-- Type: Security follow-up to 20260807052156 (site security assessment 2026-08-07)
-- Applied to production 2026-08-07 via MCP apply_migration (version 20260807062807);
-- this file matches the stamped version so `db push` never re-runs it.
--
-- 20260807052156 scoped `profiles` SELECT to self / admin / counterparty. That is
-- correct and stays. It left two problems, both fixed here.
--
-- 1. DISCOVERY BROKE. FindTradies, Search, PublicTradieProfile and
--    RecommendedTradies read `profiles` directly for tradies the caller has never
--    met. Under the new policy they return only the caller's own row, so browsing
--    showed nothing. Discovery is by definition a STRANGER read, so it needs a
--    surface that deliberately steps past the policy with a curated column list.
--
-- 2. THE FIRST ATTEMPT TRADED ONE FINDING FOR ANOTHER. That surface was a plain
--    view, which is SECURITY DEFINER by default, and Supabase's lint 0010
--    (`security_definer_view`) raised it at ERROR — worse than the WARN it was
--    predicted to be.
--
-- The fix is to split the two jobs. The FUNCTION is SECURITY DEFINER (it must be;
-- that is what reads past RLS). The VIEW over it is security_invoker = true, so
-- lint 0010 does not fire. What is left is
-- `authenticated_security_definer_function_executable` — the same WARN already
-- carried by 25 functions in this schema, not a new class of finding.
--
-- Keeping a VIEW as the client-facing object (rather than exposing the function as
-- an RPC) preserves PostgREST filtering, ordering and .range() pagination, which
-- Search.tsx and FindTradies.tsx both depend on.
--
-- tradie_details columns are FOLDED IN as td_* rather than embedded. Two reasons:
-- PostgREST FK detection through a view is unproven here (FindTradies.tsx:99
-- records that it already failed once for the tradie_ratings view), and folding
-- leaks nothing new — tradie_details has a `USING (true)` SELECT policy for
-- authenticated, so every column in it is already readable by any signed-in user.
--
-- Deliberately NOT projected: payout_speed_preference and white_card (no browse
-- screen reads either, and 20260801100807 names payout_speed_preference as a column
-- that must not ride along into a public surface), and — as before — email, phone,
-- address, abn_number, license_number, documents_url and every stripe_* id.

CREATE OR REPLACE FUNCTION public.list_public_tradies()
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
  -- INNER join: a profile with no tradie_details is not a listing. This replaces
  -- Search.tsx's `.not('tradie_details','is',null)` and FindTradies' `!inner`.
  JOIN public.tradie_details td ON td.profile_id = p.id
  WHERE p.role = 'tradie';
$function$;

REVOKE ALL ON FUNCTION public.list_public_tradies() FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_tradies() TO authenticated, service_role;

-- security_invoker = true is what keeps lint 0010 quiet. It does not weaken the
-- surface: the SECURITY DEFINER function inside still executes as its owner, so the
-- stranger rows come through. The invoker only needs EXECUTE on that function.
DROP VIEW IF EXISTS public.public_tradie_profiles;
CREATE VIEW public.public_tradie_profiles
  WITH (security_invoker = true)
  AS SELECT * FROM public.list_public_tradies();

REVOKE ALL ON public.public_tradie_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_tradie_profiles TO authenticated;

COMMENT ON VIEW public.public_tradie_profiles IS
  'Stranger-safe projection of tradie listings for discovery, backed by list_public_tradies(). Never add a column that identifies or contacts a person: no email, phone, address, abn_number, license_number, documents_url or stripe_* id.';
