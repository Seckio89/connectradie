-- Migration: platform_owner_admin_access
-- Type: Entitlements / access control
-- Description: The platform owner should have full, permanent, free access to all
-- Pro/PM features with no commission on their own jobs — WITHOUT looking like an
-- admin to clients. We introduce an explicit `profiles.is_admin` entitlement flag
-- (separate from `profiles.role`, which drives the tradie/client/admin *experience*
-- and public appearance). The owner keeps role='tradie' so clients still see a
-- normal, verified Pro tradie; is_admin drives entitlements only.
--
-- Entitlement plumbing this flag unlocks:
--   • Frontend: profiles.is_admin is read by isPlatformAdmin() to force Pro.
--   • Money: profiles.platform_fee_override_bps = 0 → 0% commission (the V2 fee
--     engine already honours a 0 override; charge sites now thread it).
--   • AI: a tradie_subscriptions pro/active row (and an admin short-circuit) →
--     unlimited AI estimates.
--   • RLS: is_admin() now recognises the flag, so the owner also has admin-level
--     row access where policies use it.

-- ── 1. Explicit admin entitlement flag ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Platform-owner/admin entitlement flag. Grants full feature access + fee '
  'exemption independently of role (which stays tradie/client for the user''s '
  'experience and public appearance). Set only for trusted platform staff.';

-- ── 2. is_admin() recognises both the role and the new flag ─────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_admin = true)
  );
END;
$function$;

-- Keep existing role='admin' accounts consistent with the new flag.
UPDATE public.profiles SET is_admin = true
WHERE role = 'admin' AND is_admin = false;

-- ── 3. Grant the platform owner full, permanent, free access ────────────────
-- Targeted by email; in any environment where the owner account doesn't exist
-- (CI, fresh DB) every statement below simply affects zero rows.

-- profiles: entitlement flag + Pro perk + 0% commission on their own jobs.
UPDATE public.profiles p
SET is_admin = true,
    is_premium = true,
    subscription_tier = 'pro',
    platform_fee_override_bps = 0,          -- 0% platform commission, capped-safe
    external_pay_allowed = true
FROM auth.users u
WHERE u.id = p.id
  AND u.email = 'williammagson@gmail.com';

-- tradie_details: public-facing Pro badge + verified, so clients see a normal
-- Pro tradie (the money resolver also reads this — the 0 override wins on fees).
UPDATE public.tradie_details td
SET subscription_tier = 'pro',
    is_verified = true
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE td.profile_id = p.id
  AND u.email = 'williammagson@gmail.com';

-- tradie_subscriptions: a free, permanent, Stripe-less Pro subscription record.
-- Drives the AI-estimate limiter (pro → unlimited) and reads as an active plan.
INSERT INTO public.tradie_subscriptions (profile_id, tier_id, status, stripe_subscription_id)
SELECT p.id, 'pro', 'active', NULL
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'williammagson@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.tradie_subscriptions ts WHERE ts.profile_id = p.id
  );

-- If the owner already had a subscription row, make sure it reads as a free,
-- permanent Pro plan (no Stripe id, active).
UPDATE public.tradie_subscriptions ts
SET tier_id = 'pro',
    status = 'active',
    stripe_subscription_id = NULL
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE ts.profile_id = p.id
  AND u.email = 'williammagson@gmail.com';
