-- Migration: force_escrow_by_default
-- Description:
--   Revenue fix (Critical/High from the audit). The anti-circumvention gate
--   (enforce_external_pay_tier) already routes a client's payment_method from
--   'external' → 'stripe' for any tradie who isn't external-pay-allowed and isn't
--   on a Property Manager tier. BUT a prior migration grandfathered EVERY existing
--   tradie to external_pay_allowed = true, so the gate never bit — most tradies
--   could still take jobs off-platform for $0 platform revenue.
--
--   This removes the blanket grandfather: escrow becomes the default for everyone
--   except the PM tiers (which legitimately settle direct). New 'external' clients
--   for non-PM tradies are silently routed to Stripe escrow by the existing gate,
--   so the platform earns its fee on the money that flows.
--
--   NOTE: existing client_contacts already set to 'external' are left as-is (not
--   retroactively switched) to avoid disrupting in-flight client relationships;
--   the change applies to new/edited clients going forward. Column writes to
--   external_pay_allowed are already locked to billing/admin by
--   20260718020000_lock_billing_columns.

UPDATE public.profiles
SET external_pay_allowed = false
WHERE role = 'tradie'
  AND COALESCE(subscription_tier, 'free') NOT IN ('pm_starter', 'pm_pro', 'pm_enterprise');
