-- Migration: stripe_webhook_events
-- Type: Reliability / idempotency
-- Description: Idempotency ledger for Stripe webhook delivery. Stripe retries the
-- SAME event (same event.id) on any non-2xx or timeout, and our handler re-runs —
-- re-releasing escrow, re-granting estimate-pack credits, etc. The stripe-webhook
-- function now claims event.id here BEFORE processing and skips duplicates.
-- Written by the function under the service role only; never read by clients.

create table if not exists public.stripe_webhook_events (
  event_id     text primary key,
  type         text,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No policies + RLS on = anon/authenticated get nothing; the service role (which
-- the webhook uses) bypasses RLS. Belt-and-suspenders revoke of table privileges.
revoke all on public.stripe_webhook_events from anon, authenticated;

comment on table public.stripe_webhook_events is
  'Idempotency ledger for Stripe webhook delivery. stripe-webhook claims event.id '
  'before processing and returns 200 without re-running on a duplicate delivery.';
