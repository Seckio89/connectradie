-- Restore 11 columns that exist in production but cannot be created from this
-- repo. Third companion to 20260728043000 (functions) and 20260728044500
-- (tables); see audit-findings/2026-07-28-repo-rebuild-gaps.md.
--
-- Found by diffing production against the e2e project, which was genuinely
-- rebuilt by replaying all 311 migrations — 88 of 94 tables matched, these 6 did
-- not. Every one of the 11 is referenced by application code, so a rebuilt
-- database returns a PostgREST error on any query touching them.
-- `payments.invoice_number` alone appears in 15 files.
--
-- `npm run check:columns` structurally cannot catch this class: it validates
-- code against src/types/supabase.ts, which is GENERATED FROM PRODUCTION. It
-- therefore proves the code matches prod, never that the migrations do.
--
-- Types, nullability and defaults are copied from production's catalogs.
-- Idempotent, so this is a no-op there.

-- ── payments ────────────────────────────────────────────────────────────────
-- invoice_number is sequence-backed in production, so the sequence has to exist
-- before the column that defaults from it, and be OWNED BY it afterwards so a
-- future DROP TABLE takes the sequence with it.

CREATE SEQUENCE IF NOT EXISTS public.payments_invoice_number_seq;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_number integer NOT NULL
    DEFAULT nextval('public.payments_invoice_number_seq'::regclass);

ALTER SEQUENCE public.payments_invoice_number_seq OWNED BY public.payments.invoice_number;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_ref text;

-- ── jobs ────────────────────────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS calendar_event_id   text,
  ADD COLUMN IF NOT EXISTS contact_flagged     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_flag_reason text,
  ADD COLUMN IF NOT EXISTS parking_available   boolean;

-- Partial index, matching production: only flagged rows are ever scanned.
CREATE INDEX IF NOT EXISTS idx_jobs_contact_flagged
  ON public.jobs USING btree (contact_flagged) WHERE (contact_flagged = true);

-- ── recurring_jobs ──────────────────────────────────────────────────────────

ALTER TABLE public.recurring_jobs
  ADD COLUMN IF NOT EXISTS auto_accept boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_date    date;

-- ── availability_slots ──────────────────────────────────────────────────────

ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS calendar_event_id text;

-- ── profiles ────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_invoice_reminder_email_at timestamp with time zone;

-- ── recurring_invoices ──────────────────────────────────────────────────────

ALTER TABLE public.recurring_invoices
  ADD COLUMN IF NOT EXISTS payout_error_message text;
