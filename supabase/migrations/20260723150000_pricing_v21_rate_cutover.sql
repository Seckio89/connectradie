-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing v2.1 — PHASE 3 / STAGE 5: the RATE CUTOVER.
--
-- ⚠️  THIS CHANGES WHAT TRADIES ARE CHARGED. It is the irreversible step.
--
-- ⚠️  DEPLOY ORDER MATTERS. Apply this ONLY together with the Phase 3 edge
--     functions. The engine (supabase/functions/_shared/pricing.ts →
--     TIER_SCHEDULES_V21) is the authority for what is actually charged; these
--     rows drive what /pricing DISPLAYS. Applying this migration before the
--     functions are deployed would advertise v2.1 while still billing V2;
--     deploying the functions first would bill v2.1 while advertising V2.
--     Neither is acceptable — do both in one go.
--
-- What changes, per spec v2.1 §1.2:
--                       rate      repeat    cap        monthly
--   free   10%→ 8%       800       500      $900→$500      $0
--   pro     7%→ 5%       500       400      $630→$400   $49→$39
--   pm      3%→ 3%       300       300      $270 (same)   $149
--
-- The commission base ALSO changes: v2.1 charges on the tradie's LABOUR only,
-- not the full job value. So an 8% headline is a *lower effective rate* than the
-- old 10% for any job containing materials, and identical for labour-only jobs.
-- Nobody pays more than they did under V2.
--
-- reduced_rate_bps / reduced_threshold_cents are VESTIGIAL under v2.1 — there is
-- no $3k threshold any more, the rate is flat on labour. They are set equal to
-- rate_bps so that any remaining legacy reader computes the correct flat rate
-- rather than silently applying a discount above $3,000.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.pricing_tiers SET
  rate_bps                = 800,
  reduced_rate_bps        = 800,   -- vestigial: flat rate under v2.1
  fee_cap_cents           = 50000, -- $500
  repeat_rate_bps         = 500,
  cap_floor_bps           = 250,
  min_fee_cents           = 500,
  updated_at              = now()
WHERE id = 'free';

UPDATE public.pricing_tiers SET
  rate_bps                = 500,
  reduced_rate_bps        = 500,   -- vestigial: flat rate under v2.1
  fee_cap_cents           = 40000, -- $400
  repeat_rate_bps         = 400,
  cap_floor_bps           = 250,
  min_fee_cents           = 500,
  monthly_price_cents     = 3900,  -- Pro $49 → $39
  updated_at              = now()
WHERE id = 'pro';

UPDATE public.pricing_tiers SET
  rate_bps                = 300,
  reduced_rate_bps        = 300,   -- vestigial: flat rate under v2.1
  fee_cap_cents           = 27000, -- $270 (unchanged)
  repeat_rate_bps         = 300,
  cap_floor_bps           = 250,
  min_fee_cents           = 500,
  updated_at              = now()
WHERE id = 'pm';

-- Guard: the seeded rows must match the engine constants in
-- supabase/functions/_shared/pricing.ts (TIER_SCHEDULES_V21). If these ever
-- diverge, /pricing advertises a rate the money path does not charge — which is
-- the exact failure this staged cutover exists to prevent. Fail the migration
-- loudly rather than ship a silent mismatch.
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count FROM public.pricing_tiers
  WHERE (id = 'free' AND (rate_bps <> 800 OR repeat_rate_bps <> 500 OR fee_cap_cents <> 50000))
     OR (id = 'pro'  AND (rate_bps <> 500 OR repeat_rate_bps <> 400 OR fee_cap_cents <> 40000))
     OR (id = 'pm'   AND (rate_bps <> 300 OR repeat_rate_bps <> 300 OR fee_cap_cents <> 27000));
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'pricing_tiers does not match TIER_SCHEDULES_V21 after cutover (% rows mismatched)', bad_count;
  END IF;
END $$;

COMMENT ON TABLE public.pricing_tiers IS
  'Fee schedule as data (v2.1). Commission is charged on LABOUR only, at a flat rate per tier, with a cheaper repeat-client rate, a 2.5%-of-labour floor under the cap, and a $5 minimum. GST-inclusive. reduced_rate_bps/reduced_threshold_cents are vestigial. Service-role writes only. MUST stay in sync with TIER_SCHEDULES_V21 in _shared/pricing.ts.';
