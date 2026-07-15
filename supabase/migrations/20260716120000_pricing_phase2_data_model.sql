-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing rebuild — PHASE 2: data model (additive; live fee flow untouched).
--
--   • pricing_tiers        — the fee schedule as data (public read, service write).
--   • tradie_subscriptions — who's on which tier (own read, webhook-only writes).
--   • payments fee-audit   — first-class columns so every NEW charge records the
--                            rate actually applied (historical rows keep their
--                            frozen metadata.platform_fee — never rewritten).
--   • profiles.platform_fee_override_bps — per-profile grandfather/override rate
--                            (locked decision: per-profile override, not a
--                            blanket founder tier).
--
-- Fee model encoded per tier (integer cents / basis points, GST-INCLUSIVE):
--   fee = rate_bps × min(amount, threshold) + reduced_rate_bps × max(0, amount − threshold)
--   capped at fee_cap_cents. All three seeded caps are hit at exactly $15,000,
--   confirming the marginal-above-threshold reading of the spec.
--
-- Additive only — no existing column/row is modified destructively.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pricing_tiers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id text PRIMARY KEY,                       -- 'free' | 'pro' | 'pm'
  name text NOT NULL,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  annual_monthly_price_cents integer,        -- effective monthly when billed annually
  rate_bps integer NOT NULL,                 -- commission on the first $3k (basis points)
  reduced_rate_bps integer NOT NULL,         -- commission above the threshold
  reduced_threshold_cents integer NOT NULL DEFAULT 300000,  -- $3,000
  fee_cap_cents integer NOT NULL,            -- absolute cap per job
  direct_pay_allowed boolean NOT NULL DEFAULT false,
  stripe_price_id_monthly text,
  stripe_price_id_annual text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Public fee schedule: anyone (including logged-out visitors on /pricing) can read.
DROP POLICY IF EXISTS "Anyone can read pricing tiers" ON public.pricing_tiers;
CREATE POLICY "Anyone can read pricing tiers" ON public.pricing_tiers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service manages pricing tiers" ON public.pricing_tiers;
CREATE POLICY "Service manages pricing tiers" ON public.pricing_tiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed (idempotent). One fee, one side, one moment — tradie, on completion, capped.
INSERT INTO public.pricing_tiers
  (id, name, monthly_price_cents, annual_monthly_price_cents, rate_bps, reduced_rate_bps,
   reduced_threshold_cents, fee_cap_cents, direct_pay_allowed, sort_order)
VALUES
  ('free', 'Free',             0,     NULL,  1000, 500, 300000, 90000, false, 1),
  ('pro',  'Pro',              4900,  NULL,  700,  350, 300000, 63000, false, 2),
  ('pm',   'Property Manager', 14900, 11900, 300,  150, 300000, 27000, true,  3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_monthly_price_cents = EXCLUDED.annual_monthly_price_cents,
  rate_bps = EXCLUDED.rate_bps,
  reduced_rate_bps = EXCLUDED.reduced_rate_bps,
  reduced_threshold_cents = EXCLUDED.reduced_threshold_cents,
  fee_cap_cents = EXCLUDED.fee_cap_cents,
  direct_pay_allowed = EXCLUDED.direct_pay_allowed,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMENT ON TABLE public.pricing_tiers IS
  'Fee schedule as data. GST-INCLUSIVE rates; marginal reduced rate above threshold; capped. Service-role writes only.';

-- ── 2. tradie_subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tradie_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_id text NOT NULL REFERENCES public.pricing_tiers(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  billing_cycle text CHECK (billing_cycle IN ('monthly', 'annual')),
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  current_period_end timestamptz,
  -- 7-day grace on past_due before fee code reverts the tradie to free rates.
  grace_until timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tradie_subscriptions_profile_id ON public.tradie_subscriptions(profile_id);
CREATE INDEX IF NOT EXISTS idx_tradie_subscriptions_tier_id ON public.tradie_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_tradie_subscriptions_stripe_sub ON public.tradie_subscriptions(stripe_subscription_id);
-- At most one non-canceled subscription per tradie.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tradie_subscriptions_active
  ON public.tradie_subscriptions(profile_id) WHERE status <> 'canceled';

ALTER TABLE public.tradie_subscriptions ENABLE ROW LEVEL SECURITY;

-- Own read only. Writes come ONLY from the Stripe webhook / server (service role):
-- tier_id is never writable by users.
DROP POLICY IF EXISTS "Users read own subscription" ON public.tradie_subscriptions;
CREATE POLICY "Users read own subscription" ON public.tradie_subscriptions
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service manages subscriptions" ON public.tradie_subscriptions;
CREATE POLICY "Service manages subscriptions" ON public.tradie_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tradie_subscriptions IS
  'Tier membership. Webhook-only writes; users can never set their own tier_id. Grace period on past_due before free-rate reversion.';

-- ── 3. payments fee-audit columns ─────────────────────────────────────────────
-- First-class audit of the fee actually charged. Historical rows keep their
-- frozen metadata.platform_fee — these stay NULL for them (never backfilled).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS platform_fee_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_rate_bps integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_tier text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS gst_on_fee_cents integer;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fee_calculated_at timestamptz;

COMMENT ON COLUMN public.payments.platform_fee_cents IS
  'Platform fee actually charged (cents, GST-inclusive). NULL on rows predating the fee audit — see metadata.platform_fee.';
COMMENT ON COLUMN public.payments.fee_rate_bps IS
  'Effective blended rate applied, basis points (fee/amount at calc time) — historical record, never recomputed.';

-- ── 4. per-profile rate override (grandfathering) ────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform_fee_override_bps integer;

COMMENT ON COLUMN public.profiles.platform_fee_override_bps IS
  'Optional grandfathered flat commission rate (bps) applied to the whole amount instead of the tier schedule; still capped by the tier cap. NULL = normal tier rates.';
