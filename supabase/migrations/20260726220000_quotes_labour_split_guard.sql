-- Migration: quotes_labour_split_guard
-- Description:
--   Audit M6. Commission could be driven to ZERO from the browser.
--
--   quotes.labour_cents / materials_cents are written directly by the tradie
--   under RLS (src/components/SubmitQuoteModal.tsx:370-371) with only a
--   client-side guard. splitAmount (_shared/feeContext.ts:116-137) trusts them:
--   with materials == amount, declaredTotal === amount so it returns
--   { labourCents: 0 } verbatim, and calculateFeeV21 charges commission on
--   labour only — so commission is $0. calculateFeeV21 rejects negative and
--   non-integer values but 0 sails through, and the v2.1 invariant
--   `commission <= labour_cents` is satisfied by 0 <= 0.
--
--   POSTing `labour_cents: 0, materials_cents: 500000` on a $5,000 job means the
--   platform earns nothing instead of $400. The only deduction left is materials
--   processing, which is Stripe's cost, not revenue.
--
--   The Phase-2 migration (20260723120000:117-118) added no CHECK at all — it
--   says NOT NULL was "deferred to Phase 3" — and the fee audit view
--   (20260725170000:76-78) only flags `labour + materials <> amount`, which a
--   labour-zero quote satisfies exactly. So nothing detected this either.
--
--   Verified before applying: 5 quotes exist, none would violate either check.

-- Non-negative. calculateFeeV21 already throws on negatives, but that is the
-- engine defending itself downstream of a value the DB should never have stored.
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_split_non_negative;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_split_non_negative
  CHECK (
    (labour_cents IS NULL OR labour_cents >= 0)
    AND (materials_cents IS NULL OR materials_cents >= 0)
  );

-- The actual hole: a quote cannot be 100% materials.
--
-- POLICY ASSUMPTION, stated plainly: this is a marketplace for trade SERVICES,
-- so a quote that declares materials but zero labour is not a real quote — it is
-- the shape of a fee-avoidance attempt. A materials-only supply has no labour to
-- commission and no service being sold.
--
-- Deliberately NOT a ratio cap (e.g. "materials <= 70% of total"): any threshold
-- would be an invented number that legitimately-high-materials jobs would trip.
-- This rule only rejects the degenerate case.
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_labour_required_with_materials;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_labour_required_with_materials
  CHECK (
    COALESCE(materials_cents, 0) = 0
    OR COALESCE(labour_cents, 0) > 0
  );

COMMENT ON CONSTRAINT quotes_labour_required_with_materials ON public.quotes IS
  'Anti-fee-avoidance (audit M6): commission is charged on labour only, so a quote declaring materials with zero labour would pay zero commission.';
