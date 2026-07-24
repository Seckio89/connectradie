-- Migration: adjustment_note_idempotency
-- Description: Add platform_fee_invoices.adjusts_charge_id plus the partial
--              UNIQUE index that makes adjustment notes idempotent.
--
-- WHY
-- ---
-- recordFeeRefund() inserts a negative "adjustment note" when a refunded
-- commission had already been invoiced. Without a uniqueness guard, running it
-- twice for one payment — concurrent refund requests, or a retry after the
-- payments UPDATE failed — emits TWO adjustment notes and double-credits the
-- commission on paper. These are tax documents; duplicates are not a cosmetic
-- problem.
--
-- WHY KEY ON THE CHARGE, NOT THE INVOICE
-- --------------------------------------
-- A monthly consolidated invoice covers many charges. Keying uniqueness on
-- adjusts_invoice_id would allow only ONE adjustment per invoice, so the second
-- distinct payment refunded against that same invoice would be silently
-- rejected as a duplicate and never credited. One adjustment note per CHARGE is
-- the correct grain.
--
-- The index is PARTIAL (where adjusts_charge_id is not null) so ordinary
-- invoices — which have no adjusts_charge_id — are unaffected and can coexist
-- freely.
--
-- The code was already written against this column (it inserts adjusts_charge_id
-- and treats 23505 as the idempotent path). The column did not exist, so every
-- adjustment note would have failed on insert — and because recordFeeRefund is
-- deliberately best-effort, it would have failed SILENTLY, leaving a tax invoice
-- standing against a refunded payment.

ALTER TABLE public.platform_fee_invoices
  ADD COLUMN IF NOT EXISTS adjusts_charge_id uuid REFERENCES public.platform_fee_charges(id);

COMMENT ON COLUMN public.platform_fee_invoices.adjusts_charge_id IS
  'For kind=''adjustment'': the specific commission charge being reversed. Uniqueness is enforced on THIS rather than adjusts_invoice_id, because one consolidated invoice can cover many charges and each refunded charge needs its own adjustment note.';

-- One adjustment note per charge, ever. Partial so real invoices are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_adjustment_per_charge
  ON public.platform_fee_invoices (adjusts_charge_id)
  WHERE adjusts_charge_id IS NOT NULL;

-- ============================================================
-- VERIFICATION (run manually)
-- ============================================================
--   select column_name from information_schema.columns
--   where table_name = 'platform_fee_invoices' and column_name = 'adjusts_charge_id';
--
--   select indexname from pg_indexes where indexname = 'uniq_adjustment_per_charge';
--
-- No charge should ever carry more than one adjustment note:
--   select adjusts_charge_id, count(*) from platform_fee_invoices
--   where adjusts_charge_id is not null
--   group by adjusts_charge_id having count(*) > 1;
--   -- expect: 0 rows
