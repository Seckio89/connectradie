-- Migration: create_worker_credential_notifications
-- Type: System-write table (credential-expiry-sweep only)
-- Description: Idempotency ledger for expiry warnings. The sweep runs daily; this
-- table is what makes "running it twice in a day sends one notification, not two" a
-- structural guarantee rather than a time-window heuristic.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.worker_credential_notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_credential_id UUID NOT NULL REFERENCES public.worker_credentials(id) ON DELETE CASCADE,
  threshold_days       INTEGER NOT NULL,
  -- The expiry date this warning was computed against. Included in the unique key so
  -- that renewing a credential in place (pushing expires_at out) re-arms all three
  -- thresholds, while a same-day re-run of the sweep still collides and no-ops.
  expires_on           DATE NOT NULL,
  sent_on              DATE NOT NULL DEFAULT current_date,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT worker_credential_notifications_threshold_check
    CHECK (threshold_days IN (60, 30, 7)),
  CONSTRAINT worker_credential_notifications_unique
    UNIQUE (worker_credential_id, threshold_days, expires_on)
);

COMMENT ON TABLE public.worker_credential_notifications IS
  'Idempotency ledger for credential expiry warnings — system-write only, inserted by the credential-expiry-sweep Edge Function via service_role. Insert with ON CONFLICT DO NOTHING and notify only on rows that actually inserted.';
COMMENT ON COLUMN public.worker_credential_notifications.expires_on IS
  'Snapshot of worker_credentials.expires_at at send time. Part of the unique key so renewals re-arm the thresholds.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.worker_credential_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================
-- None. This is bookkeeping for the sweep and is never read by a client.
-- service_role bypasses RLS; with RLS enabled and no policies, anon and
-- authenticated can neither read nor write it.

-- ============================================================
-- 4. INDEXES
-- ============================================================
-- The unique constraint already indexes (worker_credential_id, threshold_days,
-- expires_on), which covers the FK as a leading-column prefix. No extra FK index needed.
CREATE INDEX IF NOT EXISTS idx_worker_credential_notifications_sent_on
  ON public.worker_credential_notifications (sent_on DESC);

-- No updated_at column: rows are append-only bookkeeping, never edited.
