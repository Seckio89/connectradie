-- Fee charges gain a `kind` and a payout anchor, so instant-payout fees can be
-- recorded alongside commission.
--
-- PROVENANCE — this file did not exist until 2026-07-28.
-- The migration was applied straight to production via the Supabase MCP's
-- apply_migration (ledger row 20260728092722, created_by
-- admin@hpcleaning.com.au) and no file was ever written, so the repo could not
-- rebuild it. The SQL below is recovered VERBATIM from
-- supabase_migrations.schema_migrations.statements[1] — 1,782 characters, the
-- complete statement, not a reconstruction from the resulting schema.
--
-- Committed so the repo matches production. It is already applied there; the
-- guards below make it a no-op on any database that has it.
--
-- ⚠️ NOTE FOR recordFeeCharge (_shared/feeContext.ts): this DROPS
-- platform_fee_charges_payment_id_key, the unique constraint whose 23505 gave
-- that function its idempotent path. Idempotency survives — the replacement
-- partial index uniq_fee_charge_payment_kind (payment_id, kind) raises the same
-- error — but it is now scoped BY KIND, so two rows for one payment are allowed
-- when their kinds differ. That is the point (commission + instant_payout), and
-- it means anything relying on "one fee row per payment" no longer holds.

ALTER TABLE public.platform_fee_charges
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS payout_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_fee_charges_kind_check'
  ) THEN
    ALTER TABLE public.platform_fee_charges
      ADD CONSTRAINT platform_fee_charges_kind_check
      CHECK (kind IN ('commission', 'instant_payout'));
  END IF;
END;
$$;

ALTER TABLE public.platform_fee_charges
  ALTER COLUMN payment_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_charge_has_anchor'
  ) THEN
    ALTER TABLE public.platform_fee_charges
      ADD CONSTRAINT fee_charge_has_anchor
      CHECK (payment_id IS NOT NULL OR payout_id IS NOT NULL);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fee_charge_payment_kind
  ON public.platform_fee_charges (payment_id, kind)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fee_charge_payout
  ON public.platform_fee_charges (payout_id)
  WHERE payout_id IS NOT NULL;

ALTER TABLE public.platform_fee_charges
  DROP CONSTRAINT IF EXISTS platform_fee_charges_payment_id_key;

COMMENT ON COLUMN public.platform_fee_charges.kind IS
  'What this fee is: commission (our cut of labour) or instant_payout (the Stripe instant transfer fee). Determines how it is described on the tax invoice.';
COMMENT ON COLUMN public.platform_fee_charges.payout_id IS
  'Stripe payout id for instant_payout rows — the idempotency anchor when there is no payment. NULL for commission.';
COMMENT ON COLUMN public.platform_fee_charges.commission_cents IS
  'GST-INCLUSIVE fee amount for this row''s kind (not commission-only despite the name). Always equals ex_gst_cents + gst_cents.';
