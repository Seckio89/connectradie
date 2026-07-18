-- Migration: add_quote_decline_withdraw_fields
-- Description:
--   Adds metadata for two new quote outcomes:
--     * client declines an off-app quote (with an optional reason)
--     * tradie withdraws their own quote
--   The quotes.status CHECK already allows 'declined' and 'withdrawn'; this just
--   adds the supporting timestamp/reason columns. All nullable, no RLS change
--   (existing quotes policies already cover these columns).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS declined_at   timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at  timestamptz;
