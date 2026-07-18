-- The subscription webhook (stripe-webhook → syncCustomerFromStripe) upserts
-- into stripe_subscriptions with onConflict 'stripe_customer_id'. Without a
-- UNIQUE on that column the upsert fails with:
--   "no unique or exclusion constraint matching the ON CONFLICT specification"
-- the webhook returns 500, and subscription_tier / is_premium never sync.
--
-- This constraint was live in production but MISSING from the migration
-- lineage — surfaced when a fresh staging DB rebuilt from migrations and every
-- subscription event 500'd. Codified here so a rebuild/restore stays correct.
--
-- Idempotent: only adds the constraint when neither a matching unique
-- constraint nor a unique index on stripe_customer_id already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stripe_subscriptions'::regclass AND contype = 'u'
      AND conname = 'stripe_subscriptions_stripe_customer_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'stripe_subscriptions'
      AND indexdef ILIKE '%UNIQUE%(stripe_customer_id)%'
  ) THEN
    ALTER TABLE public.stripe_subscriptions
      ADD CONSTRAINT stripe_subscriptions_stripe_customer_id_key UNIQUE (stripe_customer_id);
  END IF;
END $$;
