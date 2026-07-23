-- ─────────────────────────────────────────────────────────────────────────────
-- Pricing v2.1 §7A — tax invoices for the platform commission.
--
-- This is ConnecTradie → TRADIE, for the commission we charged. It is NOT the
-- existing tradie → client job receipt (/invoice/:paymentId). Different parties,
-- different amounts, different ABN in the "From" position.
--
-- WHAT GOES ON IT: the commission ONLY.
-- materials_processing is Stripe's cost passed through AT COST — it is not
-- ConnecTradie revenue, so invoicing it would overstate our GST turnover to the
-- ATO. It is recorded on the charge row for the accountant (§7A.4: "record it
-- separately precisely so the accountant can classify it without archaeology")
-- but is deliberately excluded from the invoice totals.
--
-- The fee is GST-INCLUSIVE, so:
--     total  = commission_cents
--     gst    = round(commission / 11)
--     ex-GST = commission − gst
--
-- Two tables, because a monthly consolidated invoice covers MANY releases:
--   platform_fee_charges  — immutable ledger, one row per commission charged
--   platform_fee_invoices — the issued document, 1..N charges
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Invoice numbering ─────────────────────────────────────────────────────
-- A real sequence, never count(*)+1 — that double-issues under concurrency, and
-- a tax invoice number must be unique and sequential.
CREATE SEQUENCE IF NOT EXISTS public.platform_fee_invoice_seq START 1000;

-- ── 2. The issued document ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_fee_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        bigint NOT NULL UNIQUE DEFAULT nextval('public.platform_fee_invoice_seq'),
  tradie_profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Period covered. For a per-release invoice both bounds are that release day.
  period_start          date NOT NULL,
  period_end            date NOT NULL,

  -- Snapshot totals. NEVER recomputed from pricing_tiers — a rate change must
  -- not silently rewrite a tax document that has already been issued.
  subtotal_ex_gst_cents integer NOT NULL,
  gst_cents             integer NOT NULL,
  total_cents           integer NOT NULL,

  -- Australian adjustment (credit) note: a refund can't delete an issued tax
  -- invoice, it must be offset by a negative one that points at the original.
  kind                  text NOT NULL DEFAULT 'invoice'
                          CHECK (kind IN ('invoice', 'adjustment')),
  adjusts_invoice_id    uuid REFERENCES public.platform_fee_invoices(id),

  issued_at             timestamptz NOT NULL DEFAULT now(),
  emailed_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fee_invoice_totals_reconcile
    CHECK (total_cents = subtotal_ex_gst_cents + gst_cents),
  CONSTRAINT fee_invoice_period_sane CHECK (period_end >= period_start),
  CONSTRAINT fee_invoice_adjustment_has_target
    CHECK (kind = 'invoice' OR adjusts_invoice_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fee_invoices_tradie
  ON public.platform_fee_invoices(tradie_profile_id, issued_at DESC);

-- ── 3. The immutable charge ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_fee_charges (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_profile_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- One charge per payment: the unique constraint makes release idempotent, so a
  -- retried release can never bill the same commission twice.
  payment_id                 uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  job_id                     uuid REFERENCES public.jobs(id),

  -- Snapshot of what was actually charged, at charge time.
  commission_cents           integer NOT NULL CHECK (commission_cents >= 0),
  gst_cents                  integer NOT NULL CHECK (gst_cents >= 0),
  ex_gst_cents               integer NOT NULL CHECK (ex_gst_cents >= 0),
  -- Recorded for the accountant, NOT invoiced. See header.
  materials_processing_cents integer NOT NULL DEFAULT 0,
  fee_rate_bps               integer,
  fee_rate_type              text CHECK (fee_rate_type IN ('standard', 'repeat_client')),

  charged_at                 timestamptz NOT NULL DEFAULT now(),
  invoice_id                 uuid REFERENCES public.platform_fee_invoices(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fee_charge_totals_reconcile
    CHECK (commission_cents = ex_gst_cents + gst_cents)
);

CREATE INDEX IF NOT EXISTS idx_fee_charges_uninvoiced
  ON public.platform_fee_charges(tradie_profile_id, charged_at)
  WHERE invoice_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_fee_charges_invoice
  ON public.platform_fee_charges(invoice_id);

-- ── 4. Tradie's choice of frequency (§7A.2 — monthly is the default) ─────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fee_invoice_frequency text
  NOT NULL DEFAULT 'monthly'
  CHECK (fee_invoice_frequency IN ('monthly', 'per_release'));

COMMENT ON COLUMN public.profiles.fee_invoice_frequency IS
  'How the tradie receives tax invoices for platform commission: monthly consolidated (default, per spec 7A.2) or one per released payment.';

-- ── 5. RLS — a tradie sees only their own; nothing is user-writable ──────────
ALTER TABLE public.platform_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_charges  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tradies read own fee invoices" ON public.platform_fee_invoices;
CREATE POLICY "Tradies read own fee invoices" ON public.platform_fee_invoices
  FOR SELECT TO authenticated USING (tradie_profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service manages fee invoices" ON public.platform_fee_invoices;
CREATE POLICY "Service manages fee invoices" ON public.platform_fee_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tradies read own fee charges" ON public.platform_fee_charges;
CREATE POLICY "Tradies read own fee charges" ON public.platform_fee_charges
  FOR SELECT TO authenticated USING (tradie_profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service manages fee charges" ON public.platform_fee_charges;
CREATE POLICY "Service manages fee charges" ON public.platform_fee_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.platform_fee_invoices IS
  'Tax invoices issued BY ConnecTradie TO tradies for platform commission (spec v2.1 7A). Immutable once issued: refunds are offset by an adjustment note, never by editing or deleting. Commission only — the at-cost materials card-processing pass-through is NOT platform revenue and is excluded.';
COMMENT ON TABLE public.platform_fee_charges IS
  'Immutable ledger of commission actually charged, one row per payment. Snapshotted at release; never recomputed from pricing_tiers, so a later rate change cannot rewrite an issued tax invoice.';
