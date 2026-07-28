-- Allow status='released' on payments.
--
-- WHY THIS EXISTS
-- 20260215111352_create_payments_table.sql:32 defines
--   CHECK (status IN ('pending','completed','failed','refunded'))
-- and nothing in this repo ever widens it. Production's constraint DOES include
-- 'released' — it came from one of the ~145 applied migrations that have no
-- local file (see 20260728043000 for that story). So this is a repo/prod gap,
-- not a production bug.
--
-- WHAT IT BREAKS ON A REBUILT DATABASE
-- release-escrow pays the tradie and then writes status='released' plus
-- metadata.payout_id. On a database built from this repo that UPDATE is rejected
-- with 23514, and the failure is SILENT: release-escrow logs it, returns 200
-- with the payout id, and moves on. The result is a payment where the money has
-- genuinely moved but the row still says 'completed' with no payout_id, so:
--   • the idempotency guard at release-escrow/index.ts:163 never engages, and
--     every repeat release re-runs the whole function
--   • auto-release-payments keeps rescanning the row forever, because it only
--     looks at 'completed'
--   • reconciliation and the tradie's payout history under-report releases
-- Only Stripe's deterministic idempotency key (release_payout_<paymentId>) stops
-- the retries becoming a second payout. That is one guard too few.
--
-- Caught by the E2E on a freshly provisioned test project: the payout succeeded
-- (po_1Ty6ye…) while the row stayed 'completed' with payout_pending unset.
--
-- Idempotent, and matches production's definition exactly, so it is a no-op there.

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'released'));
