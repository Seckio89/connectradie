-- Migration: payments_recurring_invoice_type
-- Description:
--   Audit H4 part 2. Recurring invoices had no `payments` row at all, so their
--   commission could not be tax-invoiced: platform_fee_charges (the only table
--   issue-fee-invoices reads) is keyed on payment_id NOT NULL.
--
--   The fix gives those flows real payment rows, which needs a payment_type the
--   CHECK constraint accepts. Adding 'recurring_invoice' rather than reusing
--   'job_funding' is load-bearing for two reasons:
--
--     1. Earnings reporting. src/pages/Payouts.tsx filters payments to
--        payment_type = 'job_funding' (:163, :237) and reads recurring_invoices
--        separately. Reusing 'job_funding' would DOUBLE-COUNT every recurring
--        invoice in tradie earnings.
--     2. auto-release-payments selects payment_type = 'job_funding'. A recurring
--        invoice has no job and must never enter the escrow-release path.
--
--   Note these rows deliberately carry profile_id = the TRADIE, not the payer,
--   because off-app client_contacts have no profiles row. profile_id is NOT NULL
--   so the payer cannot be used. The only src consumer of payment.profile_id is
--   Invoice.tsx:61, which serves job payments.

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_type_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY[
    'lead_unlock'::text,
    'job_access'::text,
    'job_funding'::text,
    'job_payment'::text,
    'price_adjustment'::text,
    'recurring_invoice'::text
  ]));
