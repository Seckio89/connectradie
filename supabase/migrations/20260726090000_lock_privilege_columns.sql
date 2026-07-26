-- Migration: lock_privilege_columns
-- Description:
--   CRITICAL privilege-escalation fix, and the completion of the job
--   20260718020000_lock_billing_columns.sql started.
--
--   That migration correctly identified the shape of the problem — "the
--   self-update RLS on profiles / tradie_details lets a user write ANY of their
--   own columns" — but only enumerated the three revenue columns. Everything
--   else was left writable, including the column that grants platform admin.
--
--   Verified against production before writing this:
--     • profiles UPDATE policy is `USING (id = auth.uid() OR is_admin())` —
--       row-scoped, with NO column restriction.
--     • `authenticated` holds column-level UPDATE on is_admin, role,
--       platform_fee_override_bps and every verification flag.
--     • is_admin() returns true when `role = 'admin' OR is_admin = true` — i.e.
--       it reads the very column its holder can write.
--
--   So a single request from any signed-up account:
--       PATCH /rest/v1/profiles?id=eq.<own-uid>   {"is_admin": true}
--   grants full platform admin: read/write on every profile, the admin branch
--   of the `documents` bucket policy (every tradie's licence and insurance
--   documents), every job attachment, and the create_notification bypass.
--   It also defeats the billing lock above, whose early return is
--   `... OR public.is_admin()`.
--
--   Two lesser but independent holes closed by the same trigger:
--     • {"platform_fee_override_bps": 0} → 0% commission, permanently.
--     • {"license_verified": true, ...} → self-awarded trust badges on a
--       marketplace that sells verified tradies.
--
--   NOTE on verification_status: this one canNOT be locked outright. Users
--   legitimately set it to 'pending' themselves when submitting for review —
--   src/lib/identityVerification.ts:119 and src/components/VerificationCenter.tsx:304.
--   Only the trust-bearing transitions are blocked, so submission still works.
--
--   The verified flags ARE safe to lock outright: every writer is a
--   service-role client (verify-abn/index.ts:191, verify-license/index.ts:399,
--   stripe-identity-verification, stripe-webhook), and service_role takes the
--   early return. Admin UI writes go through an admin, likewise unaffected.

--   ⚠ SECURITY INVOKER IS LOAD-BEARING. Both guard functions were originally
--   written as SECURITY DEFINER, and that made them do NOTHING AT ALL:
--
--     Inside a SECURITY DEFINER function, `current_user` is the function OWNER,
--     not the caller. Verified on this database — a DEFINER function called by
--     `authenticated` reports `current_user = postgres`, while the same function
--     as INVOKER correctly reports `current_user = authenticated`.
--
--   So the early-return allow-list `current_user IN ('service_role','postgres',
--   'supabase_admin')` matched on EVERY call and every guard fell through. The
--   billing lock added in 20260718020000 had therefore never once protected
--   is_premium / subscription_tier / external_pay_allowed either — that fix was
--   a silent no-op for its entire life. Do not "restore" SECURITY DEFINER here.
--
--   is_admin() stays SECURITY DEFINER (correctly) so it can read profiles
--   irrespective of RLS.

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_profile_billing_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER   -- MUST be INVOKER; see the note above
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Billing (service_role via webhook / edge functions) and admins may change
  -- these. is_admin() reads the pre-UPDATE row, so an attacker flipping their
  -- own is_admin in this very statement is still evaluated as a non-admin.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Revenue / entitlement columns (from 20260718020000).
  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.external_pay_allowed IS DISTINCT FROM OLD.external_pay_allowed THEN
    RAISE EXCEPTION 'is_premium, subscription_tier and external_pay_allowed can only be changed by billing or an admin'
      USING ERRCODE = '42501';
  END IF;

  -- Privilege columns. Nothing outside service_role or an existing admin may
  -- ever touch these.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'is_admin and role can only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  -- Commission override: 0 here means the platform earns nothing, forever.
  IF NEW.platform_fee_override_bps IS DISTINCT FROM OLD.platform_fee_override_bps THEN
    RAISE EXCEPTION 'platform_fee_override_bps can only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  -- Trust signals. Set only by the verification edge functions (service_role).
  IF NEW.abn_verified IS DISTINCT FROM OLD.abn_verified
     OR NEW.license_verified IS DISTINCT FROM OLD.license_verified
     OR NEW.license_api_verified IS DISTINCT FROM OLD.license_api_verified
     OR NEW.is_identity_verified IS DISTINCT FROM OLD.is_identity_verified THEN
    RAISE EXCEPTION 'verification flags can only be set by the verification service or an admin'
      USING ERRCODE = '42501';
  END IF;

  -- verification_status: submitting for review ('pending') and clearing back to
  -- 'unverified' are legitimate self-service actions. Awarding oneself
  -- 'verified' (or 'rejected') is not.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND COALESCE(NEW.verification_status, '') NOT IN ('pending', 'unverified') THEN
    RAISE EXCEPTION 'verification_status can only be set to pending or unverified by a user'
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

-- ── tradie_details: subscription_tier + is_verified ──────────────────────────
--   is_verified drives the "verified tradie" badge in search results, and was
--   self-writable for the same reason.
CREATE OR REPLACE FUNCTION public.lock_tradie_billing_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER   -- MUST be INVOKER; see the note above
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

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'is_verified can only be set by the verification service or an admin'
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
