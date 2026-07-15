-- Dual payment mode: let a tradie run existing clients on manual/external payment
-- (bank transfer, cash, cheque, accountant) while new clients can go through Stripe.
--
-- Additive only — no existing column/row is modified destructively.

-- 1. Per-client payment method on the off-app CRM contact.
--    Default 'external': existing + manually-added clients keep paying the way they
--    always have. Only clients the tradie explicitly sets to 'stripe' get a pay link.
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'external';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_contacts'::regclass
      AND conname = 'client_contacts_payment_method_check'
  ) THEN
    ALTER TABLE public.client_contacts
      ADD CONSTRAINT client_contacts_payment_method_check
      CHECK (payment_method IN ('stripe', 'external'));
  END IF;
END $$;

-- 2. Tradie bank details, printed on external (manual-transfer) invoices so the
--    client knows where to pay. Full details (not masked) — the platform never
--    touches this money, it only records the invoice.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_bsb text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_name text;

-- 3. External-payment tracking on recurring invoices.
--    An external invoice is created with payment_method = 'external' (no Stripe
--    session). When the tradie confirms they were paid off-platform, these record
--    how/when. Date received reuses the existing paid_at column.
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS external_payment_method text;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS external_reference text;
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS marked_paid_by uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_contacts.payment_method IS
  'How this client pays: stripe (app pay link) or external (manual bank transfer / cash — record-only invoices).';
COMMENT ON COLUMN public.recurring_invoices.external_payment_method IS
  'For payment_method=external paid invoices: bank_transfer | cash | cheque | accountant.';
