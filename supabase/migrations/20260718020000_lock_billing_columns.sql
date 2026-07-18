-- Migration: lock_billing_columns
-- Description:
--   CRITICAL revenue fix. The self-update RLS on profiles / tradie_details lets a
--   user write ANY of their own columns — including the fee-tier / premium flags
--   (profiles.is_premium, profiles.subscription_tier, tradie_details.subscription_tier)
--   and the escrow-bypass flag (profiles.external_pay_allowed). A tradie could
--   `update tradie_details set subscription_tier='pro'` and pay the lower commission
--   (and unlock Pro perks) without ever paying the subscription.
--
--   These fields must only change via billing (the Stripe webhook, which runs as
--   service_role) or an admin. BEFORE UPDATE triggers block any other actor from
--   changing them. Normal profile edits (name, bio, etc.) are unaffected — the
--   trigger only fires when a guarded column actually changes.

-- ── profiles: is_premium, subscription_tier, external_pay_allowed ────────────
CREATE OR REPLACE FUNCTION public.lock_profile_billing_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Billing (service_role via webhook) and admins may change these.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.external_pay_allowed IS DISTINCT FROM OLD.external_pay_allowed THEN
    RAISE EXCEPTION 'is_premium, subscription_tier and external_pay_allowed can only be changed by billing or an admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lock_profile_billing ON public.profiles;
CREATE TRIGGER trg_lock_profile_billing
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_profile_billing_columns();

-- ── tradie_details: subscription_tier (the fee-tier source of truth) ─────────
CREATE OR REPLACE FUNCTION public.lock_tradie_billing_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'subscription_tier can only be changed by billing or an admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lock_tradie_billing ON public.tradie_details;
CREATE TRIGGER trg_lock_tradie_billing
  BEFORE UPDATE ON public.tradie_details
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_tradie_billing_columns();
