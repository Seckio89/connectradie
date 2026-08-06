-- Migration: fix_role_first_claim_and_team_reinvite
-- Applied to production 2026-08-06 via MCP apply_migration (version 20260806111049);
-- this file matches the stamped version so `db push` never re-runs it.
--
-- Description:
--   20260726090000_lock_privilege_columns.sql closed a real privilege
--   escalation, but its role guard blocked EVERY role change by non-admins —
--   including onboarding, which is precisely a user setting their own role
--   for the first time. handle_new_user creates profiles with role = NULL and
--   Onboarding.tsx sets 'client'/'tradie'; since 2026-07-26 that update raised
--   42501 and no new account could finish onboarding (verified in prod: last
--   completed signup 2026-07-23; both later signups stuck at role = NULL,
--   onboarding_completed = false, surfacing as "Failed to save your profile").
--
--   Fix A: permit the one-time first claim NULL -> client/tradie. Everything
--   the original lock protected stays locked: client<->tradie switches,
--   anything -> admin, is_admin, fee overrides, verification flags.
--
--   Fix B: the employee onboarding path writes its join request BEFORE the
--   profile update, so the trigger failure left an orphaned 'invited' row in
--   business_team_members. On retry the upsert takes ON CONFLICT DO UPDATE,
--   and the table's only UPDATE policy is owner-only -> "new row violates
--   row-level security policy (USING expression)". Members may INSERT their
--   own request but could never re-submit it. Add a member self-update policy
--   scoped to their own un-accepted, un-archived request.
--
--   Verified by execution (rollback-safe probes as `authenticated` with real
--   uids): NULL->tradie succeeds; client->tradie, NULL->admin and
--   is_admin=true all still raise 42501; member re-submit of an invited row
--   succeeds; member self-approval to 'active' is rejected by WITH CHECK.

-- ============================================================
-- A. profiles: allow first-claim of role (NULL -> client/tradie)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lock_profile_billing_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER   -- MUST stay INVOKER: as DEFINER, current_user is the owner
                     -- and the allow-list below matches every caller (see
                     -- 20260726090000's warning; verified on this database).
  SET search_path TO 'public'
AS $function$
BEGIN
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

  -- is_admin: nothing outside service_role or an existing admin may ever touch it.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin can only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  -- role: a user may claim their role ONCE, during onboarding, going from
  -- NULL to client or tradie. Changing an established role, or claiming
  -- 'admin', still requires an admin. (The blanket block here was what made
  -- onboarding impossible for every signup after 2026-07-26.)
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT (OLD.role IS NULL AND NEW.role IN ('client', 'tradie')) THEN
    RAISE EXCEPTION 'role can only be changed by an admin'
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
  -- 'unverified' are legitimate self-service actions.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND COALESCE(NEW.verification_status, '') NOT IN ('pending', 'unverified') THEN
    RAISE EXCEPTION 'verification_status can only be set to pending or unverified by a user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- B. business_team_members: member may re-submit their own pending request
-- ============================================================
-- Scoped tight: only the member's own row, only while it is still an
-- un-accepted ('invited'), un-archived request. A member cannot approve
-- themselves (status must remain 'invited' after the write), cannot touch an
-- active membership, and cannot resurrect a row the owner archived.
DROP POLICY IF EXISTS "business_team_members_update_own_request" ON public.business_team_members;
CREATE POLICY "business_team_members_update_own_request"
  ON public.business_team_members
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = member_profile_id
    AND status = 'invited'
    AND archived_at IS NULL
  )
  WITH CHECK (
    (SELECT auth.uid()) = member_profile_id
    AND status = 'invited'
  );
