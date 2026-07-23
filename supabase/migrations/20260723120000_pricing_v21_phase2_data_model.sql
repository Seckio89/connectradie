-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing rebuild — v2.1 PHASE 2: data model (additive; live fee flow UNTOUCHED).
--
-- v2.1 moves commission onto LABOUR only, adds a repeat-client rate, a 2.5% floor
-- under the cap, and at-cost card processing on materials. This migration lays the
-- data model for that WITHOUT changing anything charged today:
--
--   • pricing_tiers            — add the v2.1 columns (repeat rate, floor, min fee,
--                                instant-payout config, team seats) and seed them.
--                                The LIVE-charged columns (rate_bps, reduced_rate_bps,
--                                reduced_threshold_cents, fee_cap_cents, monthly_price_cents)
--                                are DELIBERATELY LEFT AS-IS — the money path and the
--                                /pricing page still read the V2 values and must agree.
--                                Phase 3 flips those in one deliberate cutover.
--   • platform_config          — key/value; materials_processing_bps = 193 (Stripe's
--                                effective inc-GST card rate; at cost, never marked up).
--   • payments (v2.1 audit)    — labour/materials split + commission vs materials-
--                                processing recorded separately so a payout is never one
--                                opaque number. Historical + current V2 rows keep their
--                                existing columns; these stay NULL until Phase 3 writes them.
--   • quotes                   — labour_cents / materials_cents / materials_description.
--                                labour_cents is left NULLABLE (NOT NULL deferred to Phase 3
--                                once SubmitQuoteModal populates it) so existing insert paths
--                                keep working. Existing rows are backfilled from the price.
--   • idx_jobs_pair_completed  — supports the server-side repeat-client lookup.
--
-- NOTE on GST column: the spec names `gst_component_cents`; this schema already has
-- payments.gst_on_fee_cents with the identical meaning (1/11 of the commission). We
-- REUSE that column rather than add a duplicate — Phase 3 writes the commission's GST
-- component into gst_on_fee_cents. (Decision confirmed with William, 2026-07-23.)
--
-- Additive only — no existing column/row is modified destructively.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pricing_tiers: v2.1 columns ───────────────────────────────────────────
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS repeat_rate_bps integer;
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS cap_floor_bps integer NOT NULL DEFAULT 250;
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS min_fee_cents integer NOT NULL DEFAULT 500;
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS instant_payout_bps integer NOT NULL DEFAULT 150;
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS instant_payout_min_cents integer NOT NULL DEFAULT 200;
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS team_seats integer;

COMMENT ON COLUMN public.pricing_tiers.repeat_rate_bps IS
  'v2.1 commission on labour for a repeat (tradie, client) pair — 2nd job onward. Not read by the live V2 engine; activated at Phase 3 cutover.';
COMMENT ON COLUMN public.pricing_tiers.cap_floor_bps IS
  'v2.1 floor under the cap: commission never below this % of labour, so the cap cannot go underwater.';
COMMENT ON COLUMN public.pricing_tiers.min_fee_cents IS
  'v2.1 minimum commission (cents), itself clamped never to exceed the job labour.';

-- Seed ONLY the new v2.1 columns. The live rate_bps / reduced_rate_bps /
-- fee_cap_cents / monthly_price_cents are intentionally NOT touched here — see header.
-- v2.1 targets for Phase 3 (recorded in comments, applied then):
--   free: rate 800 / repeat 500 / cap $500 / $0
--   pro:  rate 500 / repeat 400 / cap $400 / $39/mo
--   pm:   rate 300 / repeat 300 / cap $270 / $149 ($119 annual)
UPDATE public.pricing_tiers SET repeat_rate_bps = 500, min_fee_cents = 500, cap_floor_bps = 250 WHERE id = 'free';
UPDATE public.pricing_tiers SET repeat_rate_bps = 400, min_fee_cents = 500, cap_floor_bps = 250 WHERE id = 'pro';
UPDATE public.pricing_tiers SET repeat_rate_bps = 300, min_fee_cents = 500, cap_floor_bps = 250, team_seats = 10 WHERE id = 'pm';

-- Backfill any tiers the UPDATEs above didn't cover (defensive; keeps repeat ≤ rate).
UPDATE public.pricing_tiers SET repeat_rate_bps = rate_bps WHERE repeat_rate_bps IS NULL;
ALTER TABLE public.pricing_tiers ALTER COLUMN repeat_rate_bps SET NOT NULL;

-- Sanity constraints (hold for both the current V2 values and the Phase 3 v2.1 values):
--   repeat rate is a real discount (0 ≤ repeat ≤ standard); floor sits below the standard rate.
ALTER TABLE public.pricing_tiers DROP CONSTRAINT IF EXISTS pricing_tiers_repeat_rate_sane;
ALTER TABLE public.pricing_tiers ADD CONSTRAINT pricing_tiers_repeat_rate_sane
  CHECK (repeat_rate_bps >= 0 AND repeat_rate_bps <= rate_bps);
ALTER TABLE public.pricing_tiers DROP CONSTRAINT IF EXISTS pricing_tiers_cap_floor_sane;
ALTER TABLE public.pricing_tiers ADD CONSTRAINT pricing_tiers_cap_floor_sane
  CHECK (cap_floor_bps >= 0 AND cap_floor_bps <= rate_bps);

-- ── 2. platform_config ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_config (
  key        text PRIMARY KEY,
  value_int  integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- Service-role writes only. Public read allowed so the quote form / pricing page can
-- show the at-cost materials-processing rate (it is a published, non-secret number).
DROP POLICY IF EXISTS "Anyone can read platform config" ON public.platform_config;
CREATE POLICY "Anyone can read platform config" ON public.platform_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service manages platform config" ON public.platform_config;
CREATE POLICY "Service manages platform config" ON public.platform_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.platform_config (key, value_int) VALUES ('materials_processing_bps', 193)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_config IS
  'Platform-level tunables. materials_processing_bps MUST always equal Stripe''s actual effective inc-GST card rate — "at cost, no markup" is a published promise; marking it up silently would be a trust and compliance problem.';

-- ── 3. payments: v2.1 fee-audit columns ───────────────────────────────────────
-- Records the v2.1 split. platform_fee_cents (existing) becomes commission +
-- materials-processing at Phase 3; commission_cents and materials_processing_cents
-- keep the two separable so the payout breakdown never blends them.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS labour_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS materials_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS commission_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS materials_processing_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS materials_processing_bps integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_rate_type text
  CHECK (fee_rate_type IN ('standard', 'repeat_client'));
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_floor_applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payments.commission_cents IS
  'v2.1 platform commission on labour only (cents, GST-inclusive). platform_fee_cents = commission_cents + materials_processing_cents once Phase 3 wires the split. gst_on_fee_cents holds this commission''s GST component (1/11).';
COMMENT ON COLUMN public.payments.materials_processing_cents IS
  'At-cost card processing on the materials portion (cents). NOT platform revenue; never capped into or blended with commission.';

-- ── 4. quotes: labour / materials split ────────────────────────────────────────
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS labour_cents integer;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS materials_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS materials_description text;

-- Backfill existing quotes: labour = the quoted price (firm, else max, else min),
-- converted dollars → cents; materials = 0. labour_cents stays NULLABLE — the
-- NOT NULL constraint is deferred to Phase 3, when SubmitQuoteModal writes it on
-- every new quote. (Enforcing it now would break the current single-price insert path.)
UPDATE public.quotes
  SET labour_cents = ROUND(COALESCE(firm_price, price_max, price_min, 0) * 100)::integer
  WHERE labour_cents IS NULL;

COMMENT ON COLUMN public.quotes.labour_cents IS
  'v2.1 tradie labour (cents) — commission applies to this only. Backfilled from the quoted price; NOT NULL deferred to Phase 3.';
COMMENT ON COLUMN public.quotes.materials_cents IS
  'v2.1 materials at cost (cents) — 0% commission, passed through escrow untouched.';

-- ── 5. repeat-client lookup index ──────────────────────────────────────────────
-- Supports: does a prior completed+released job exist for this (tradie, client) pair?
CREATE INDEX IF NOT EXISTS idx_jobs_pair_completed
  ON public.jobs (tradie_id, client_id) WHERE status = 'completed';
