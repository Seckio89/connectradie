-- ─────────────────────────────────────────────────────────────────────────────
-- AI Estimate Packs — a one-time top-up of bonus AI-estimate credits for free
-- tier tradies. $4.99 for 20 credits. Non-expiring, stacks on top of the monthly
-- free allowance, and multiple packs can be bought. Credits are spent oldest-pack
-- first, and only AFTER the month's free allowance is used up.
--
-- Rows are created by the stripe-webhook on checkout.session.completed and spent
-- by the estimate-quote edge function (both service role). Tradies read their own
-- packs (for the balance display) but never write them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.estimate_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_payment_intent_id text UNIQUE,
  credits_purchased integer NOT NULL DEFAULT 20,
  credits_remaining integer NOT NULL DEFAULT 20,
  amount_cents integer NOT NULL DEFAULT 499,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'exhausted', 'refunded')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_packs_profile ON public.estimate_packs(profile_id);
-- Consumption picks the oldest active pack with credits left.
CREATE INDEX IF NOT EXISTS idx_estimate_packs_active
  ON public.estimate_packs(profile_id, purchased_at) WHERE status = 'active';

ALTER TABLE public.estimate_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_packs_read" ON public.estimate_packs;
CREATE POLICY "own_packs_read" ON public.estimate_packs
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service manages estimate packs" ON public.estimate_packs;
CREATE POLICY "Service manages estimate packs" ON public.estimate_packs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.estimate_packs IS
  'One-time bonus AI-estimate credit packs. Non-expiring; spent after the monthly free allowance, oldest pack first. Server-written, own-read.';

-- ── Atomic credit consumption ────────────────────────────────────────────────
-- Decrements one credit from the caller's oldest active pack, marking it
-- 'exhausted' when it hits zero. Row-locked so concurrent estimates can't
-- double-spend a credit. Returns the pack id it drew from, or NULL when the
-- tradie has no pack credits left.
CREATE OR REPLACE FUNCTION public.consume_estimate_pack_credit(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.estimate_packs
  WHERE profile_id = p_profile_id AND status = 'active' AND credits_remaining > 0
  ORDER BY purchased_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.estimate_packs
  SET credits_remaining = credits_remaining - 1,
      status = CASE WHEN credits_remaining - 1 <= 0 THEN 'exhausted' ELSE status END
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

-- Server-only: users must never spend their own credits directly.
REVOKE ALL ON FUNCTION public.consume_estimate_pack_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_estimate_pack_credit(uuid) TO service_role;

COMMENT ON FUNCTION public.consume_estimate_pack_credit(uuid) IS
  'Atomically spend one bonus credit from the oldest active estimate pack. Returns the pack id drawn from, or NULL if none remain.';
