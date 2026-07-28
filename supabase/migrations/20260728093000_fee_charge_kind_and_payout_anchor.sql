-- Migration: add_kind_and_payout_anchor_to_platform_fee_charges
-- Description: Let the fee ledger record the Stripe INSTANT PAYOUT fee alongside
-- commission.
--
-- Stripe's platform pricing scheme now collects our instant-payout fee (1.5%,
-- min $2, from pricing_tiers.instant_payout_bps / _min_cents) as an application
-- fee. That is real platform revenue and it was being recorded NOWHERE: not in
-- this ledger, not on a tax invoice, invisible to payout-reconciliation. Only
-- loose `instant_fee_cents` blobs in Stripe/payment metadata.
--
-- The table was built as "one row per payment, recording commission":
--   payment_id uuid NOT NULL UNIQUE REFERENCES payments(id)
-- Instant fees don't fit that grain:
--   * the per-payout button acts on the Connect BALANCE and has no payments row;
--   * a release-triggered instant payout DOES have one, but that payment already
--     owns the commission row, so a second row would violate the unique key —
--     and recordFeeCharge treats 23505 as its idempotent success path, so it
--     would have been swallowed SILENTLY.
--
-- So: `kind` discriminates, uniqueness moves to (payment_id, kind), payment_id
-- becomes optional, and `payout_id` (the Stripe payout id) is the natural
-- idempotency key for balance-anchored fees.
--
-- `commission_cents` keeps carrying the GST-INCLUSIVE amount for whatever kind
-- the row is — renaming it would break TaxInvoice.tsx, recordFeeRefund,
-- issue-fee-invoices and the generated types for no behavioural gain. The
-- CHECK (commission_cents = ex_gst_cents + gst_cents) invariant is unchanged and
-- still holds for both kinds.
--
-- Security tier: System-write (service_role inserts, tradies read own). This
-- migration does not change access control — reads are still scoped by
-- tradie_profile_id — so the existing RLS policies stay exactly as they are.

-- ============================================================
-- 1. ALTER TABLE
-- ============================================================
ALTER TABLE public.platform_fee_charges
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS payout_id text;

-- Existing rows are all commission; the DEFAULT already backfilled them.
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

-- Balance-anchored instant payouts have no payment to point at.
ALTER TABLE public.platform_fee_charges
  ALTER COLUMN payment_id DROP NOT NULL;

-- Every row must still be attributable to something — a payment or a payout.
-- Without this, a bug could write an orphan revenue row that reconciles to
-- nothing.
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

-- ============================================================
-- 2. UNIQUENESS — the idempotency guarantee, per kind
-- ============================================================
-- Replaces UNIQUE(payment_id). Same protection for commission (a retried
-- release still can't bill twice), while allowing one instant_payout row on the
-- same payment.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fee_charge_payment_kind
  ON public.platform_fee_charges (payment_id, kind)
  WHERE payment_id IS NOT NULL;

-- Stripe payout ids are globally unique, so this makes recording an instant fee
-- idempotent even though there is no payment to key on. Partial, because
-- commission rows have no payout_id and NULLs would not conflict anyway.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fee_charge_payout
  ON public.platform_fee_charges (payout_id)
  WHERE payout_id IS NOT NULL;

-- Dropped LAST: until the replacement index exists, this is the only thing
-- stopping a double-billed commission.
ALTER TABLE public.platform_fee_charges
  DROP CONSTRAINT IF EXISTS platform_fee_charges_payment_id_key;

-- ============================================================
-- 3. COMMENTS
-- ============================================================
COMMENT ON COLUMN public.platform_fee_charges.kind IS
  'What this fee is: commission (our cut of labour) or instant_payout (the Stripe instant transfer fee). Determines how it is described on the tax invoice.';
COMMENT ON COLUMN public.platform_fee_charges.payout_id IS
  'Stripe payout id for instant_payout rows — the idempotency anchor when there is no payment. NULL for commission.';
COMMENT ON COLUMN public.platform_fee_charges.commission_cents IS
  'GST-INCLUSIVE fee amount for this row''s kind (not commission-only despite the name). Always equals ex_gst_cents + gst_cents.';
