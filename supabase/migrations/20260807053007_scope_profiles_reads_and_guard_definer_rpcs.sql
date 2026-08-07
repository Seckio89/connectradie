-- Migration: scope_profiles_reads_and_guard_definer_rpcs
-- Type: Security — PII exposure + IDOR (site security assessment 2026-08-07)
-- Applied to production 2026-08-07 via MCP apply_migration (version 20260807053007);
-- this file matches the stamped version so `db push` never re-runs it.
--
-- ⚠️ INCOMPLETE — see the PR. Two things are NOT done:
--   1. public_tradie_profiles trips the `security_definer_view` advisor at ERROR
--      level (this file predicted WARN). Fixing one ERROR finding by adding
--      another is not an acceptable trade; the discovery surface needs
--      redesigning as a SECURITY DEFINER *function* (same WARN as the existing
--      25 definer functions) or as an explicit listed-tradie policy.
--   2. The four browse call sites still query `profiles` directly, so under the
--      new policy they return only the caller's own row. Tradie discovery is
--      broken until they are repointed. PostgREST embed resolution from the view
--      was never verified — the HTTP probe failed to connect (curl 56).
--
-- FINDING (critical): `profiles` SELECT policy was
-- `USING (auth.role() = 'authenticated')` — no row scoping — and `authenticated`
-- holds column-level SELECT on all 72 columns. Any signed-in user could read
-- EVERY row: email, phone, address, postcode, abn_number, license_number,
-- stripe_customer_id, stripe_connect_account_id, documents_url.
--
-- Measured before this migration, as `authenticated` with a uid owning nothing:
--   profiles_readable: 5   with_email: 5   with_phone: 2   with_address: 2
-- i.e. `GET /rest/v1/profiles?select=*` + pagination = the whole user base.
--
-- 20260725140000_private_pii_split deliberately relocated secrets instead of
-- restricting `profiles`, on the grounds that "53 PostgREST FK-embeds and 76
-- direct reads depend on it being readable". That reasoning holds only for a
-- view SWAP. It does not hold for a counterparty-aware row policy: every one of
-- those embeds reads a profile the caller genuinely transacts with
-- (`profiles!jobs_client_id_fkey(full_name, email, phone)` and friends), so they
-- keep working. What stops working is reading a STRANGER — which is the bug.
-- 20260801100807 deferred to "the profiles-RLS project, which owns the real
-- column-split design"; this is that project's first half. Physically moving the
-- remaining PII into profile_private stays a follow-up.
--
-- Also closes, from the same assessment:
--   • get_service_worker_details — SECURITY DEFINER, EXECUTE to authenticated,
--     NO authorisation check at all. Any signed-in user could pass any recurring
--     job id and read a worker's name, trades, qualifications and white card.
--   • get_user_conversation_ids / is_conversation_creator / can_view_job_tracking
--     / has_user_engagement — SECURITY DEFINER taking a CALLER-SUPPLIED identity
--     with no auth.uid() check, so each was an IDOR oracle at /rest/v1/rpc/.
--   • search_businesses_by_name — caller controls the ILIKE pattern, so '%'
--     enumerated every tradie business + full name, 10 at a time.
--   • employer_approve_member — a user could self-set employer_id/employer_status
--     then approve themselves, flipping role client -> tradie and bypassing the
--     once-only role claim.
--   • update_tradie_cost_settings_updated_at — mutable search_path (advisor).

-- ============================================================
-- 0. Caller-context helpers
-- ============================================================

-- Service-role detection that cannot throw. The JWT claims GUC is absent for
-- internal callers (triggers, cron, psql) and is not guaranteed to be valid
-- JSON, so the cast is wrapped — mirrors the guard proven in create_notification.
CREATE OR REPLACE FUNCTION public.is_service_role()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := '';
BEGIN
  BEGIN
    v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  EXCEPTION WHEN OTHERS THEN
    v_role := '';
  END;
  RETURN v_role = 'service_role';
END;
$function$;

REVOKE ALL ON FUNCTION public.is_service_role() FROM public;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, service_role;

-- Does the caller actually transact with p_other?
--
-- SECURITY DEFINER so the relationship probe is not itself filtered by the
-- policy it feeds (that would recurse). Every branch is anchored on auth.uid(),
-- so it cannot be used to ask about two OTHER people.
--
-- The branch list is derived from the FK graph into profiles, restricted to the
-- pairs the client actually embeds across. Order matters only for short-circuit
-- speed: jobs and conversations dominate real traffic.
CREATE OR REPLACE FUNCTION public.shares_engagement_with(p_other uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_other IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND (
       -- Jobs: the core client <-> tradie pair.
       EXISTS (SELECT 1 FROM public.jobs j
                WHERE (j.client_id = (SELECT auth.uid()) AND j.tradie_id = p_other)
                   OR (j.tradie_id = (SELECT auth.uid()) AND j.client_id = p_other))
       -- A tradie quoting the caller's job, and the caller quoting a job.
    OR EXISTS (SELECT 1 FROM public.quotes q
                JOIN public.jobs j ON j.id = q.job_id
                WHERE (q.tradie_id = p_other  AND j.client_id = (SELECT auth.uid()))
                   OR (q.tradie_id = (SELECT auth.uid()) AND j.client_id = p_other))
       -- Shared conversation (chat lists embed profiles for every participant).
    OR EXISTS (SELECT 1 FROM public.conversation_participants me
                JOIN public.conversation_participants them
                  ON them.conversation_id = me.conversation_id
                WHERE me.user_id = (SELECT auth.uid()) AND them.user_id = p_other)
    OR EXISTS (SELECT 1 FROM public.messages m
                WHERE (m.sender_id = (SELECT auth.uid()) AND m.receiver_id = p_other)
                   OR (m.receiver_id = (SELECT auth.uid()) AND m.sender_id = p_other))
       -- Recurring / ongoing service relationships.
    OR EXISTS (SELECT 1 FROM public.recurring_jobs r
                WHERE (r.client_id = (SELECT auth.uid()) AND r.tradie_id = p_other)
                   OR (r.tradie_id = (SELECT auth.uid()) AND r.client_id = p_other))
    OR EXISTS (SELECT 1 FROM public.recurring_invoices ri
                WHERE (ri.homeowner_id = (SELECT auth.uid()) AND ri.tradie_id = p_other)
                   OR (ri.tradie_id = (SELECT auth.uid()) AND ri.homeowner_id = p_other))
    OR EXISTS (SELECT 1 FROM public.service_agreements sa
                WHERE (sa.client_id = (SELECT auth.uid()) AND sa.tradie_id = p_other)
                   OR (sa.tradie_id = (SELECT auth.uid()) AND sa.client_id = p_other))
    OR EXISTS (SELECT 1 FROM public.service_reminders sr
                WHERE (sr.client_id = (SELECT auth.uid()) AND sr.tradie_id = p_other)
                   OR (sr.tradie_id = (SELECT auth.uid()) AND sr.client_id = p_other))
       -- Reviews, saved relationships, bookings.
    OR EXISTS (SELECT 1 FROM public.reviews rv
                WHERE (rv.client_id = (SELECT auth.uid()) AND rv.tradie_id = p_other)
                   OR (rv.tradie_id = (SELECT auth.uid()) AND rv.client_id = p_other))
    OR EXISTS (SELECT 1 FROM public.connections cn
                WHERE (cn.client_id = (SELECT auth.uid()) AND cn.tradie_id = p_other)
                   OR (cn.tradie_id = (SELECT auth.uid()) AND cn.client_id = p_other))
    OR EXISTS (SELECT 1 FROM public.my_trades mt
                WHERE (mt.client_id = (SELECT auth.uid()) AND mt.tradie_id = p_other)
                   OR (mt.tradie_id = (SELECT auth.uid()) AND mt.client_id = p_other))
    OR EXISTS (SELECT 1 FROM public.availability_slots av
                WHERE (av.tradie_id = (SELECT auth.uid()) AND av.booked_by = p_other)
                   OR (av.booked_by = (SELECT auth.uid()) AND av.tradie_id = p_other))
       -- Workforce: employer <-> member, in both directions.
    OR EXISTS (SELECT 1 FROM public.business_team_members b
                WHERE (b.business_owner_id = (SELECT auth.uid()) AND b.member_profile_id = p_other)
                   OR (b.member_profile_id = (SELECT auth.uid()) AND b.business_owner_id = p_other))
    OR EXISTS (SELECT 1 FROM public.business_join_requests jr
                WHERE (jr.business_owner_id = (SELECT auth.uid()) AND jr.requester_id = p_other)
                   OR (jr.requester_id = (SELECT auth.uid()) AND jr.business_owner_id = p_other))
    OR EXISTS (SELECT 1 FROM public.profiles pr
                WHERE (pr.id = (SELECT auth.uid()) AND pr.employer_id = p_other)
                   OR (pr.id = p_other AND pr.employer_id = (SELECT auth.uid())))
       -- Hiring: an applicant and the vacancy's employer.
    OR EXISTS (SELECT 1 FROM public.vacancy_applications va
                JOIN public.trade_vacancies tv ON tv.id = va.vacancy_id
                WHERE (tv.employer_id = (SELECT auth.uid()) AND va.applicant_id = p_other)
                   OR (va.applicant_id = (SELECT auth.uid()) AND tv.employer_id = p_other))
       -- Off-app clients a tradie manages, once linked to a real account.
    OR EXISTS (SELECT 1 FROM public.client_contacts cc
                WHERE (cc.owner_id = (SELECT auth.uid()) AND cc.linked_profile_id = p_other)
                   OR (cc.linked_profile_id = (SELECT auth.uid()) AND cc.owner_id = p_other))
       -- Both sides of a dispute must be able to render the other's name.
    OR EXISTS (SELECT 1 FROM public.disputes d
                WHERE (d.opened_by = (SELECT auth.uid()) AND d.against_user = p_other)
                   OR (d.against_user = (SELECT auth.uid()) AND d.opened_by = p_other))
     );
$function$;

REVOKE ALL ON FUNCTION public.shares_engagement_with(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.shares_engagement_with(uuid) TO authenticated, service_role;

-- ============================================================
-- 1. profiles: scope SELECT to self / admin / counterparty
-- ============================================================
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
    OR public.shares_engagement_with(id)
  );

-- ============================================================
-- 2. public_tradie_profiles — the browse surface
-- ============================================================
-- Discovery is the one legitimate stranger read: a client browsing tradies has
-- no prior relationship by definition. This view is the ONLY way to read a
-- stranger, and it carries no PII.
--
-- DELIBERATELY a SECURITY DEFINER view (no security_invoker), unlike the four
-- existing views in this schema. Those project rows the caller can already see,
-- so invoker semantics cost them nothing. This one must show rows the caller
-- CANNOT see in the base table — under security_invoker=true the policy above
-- would filter every stranger out and discovery would return an empty list.
-- Safety comes from the column list, not from RLS: the sensitive columns are
-- not selected, so they cannot be reached through it. Supabase's
-- `security_definer_view` advisor will flag this; it is intentional and is the
-- narrower risk than exposing all 72 columns to every signup.
DROP VIEW IF EXISTS public.public_tradie_profiles;
CREATE VIEW public.public_tradie_profiles AS
  SELECT
    p.id,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.cover_photo_url,
    p.suburb,
    p.public_suburb,
    p.postcode,
    p.role,
    p.is_premium,
    p.verified_trades,
    p.declared_trades,
    p.verification_status,
    p.license_verified,
    p.abn_verified,
    p.is_identity_verified,
    p.call_out_fee,
    p.show_callout_fee,
    p.callout_fee_waived_on_proceed,
    p.is_emergency_available,
    p.team_size,
    p.service_radius_km,
    p.has_phone,
    p.onboarding_completed,
    p.stripe_connect_onboarding_complete
  FROM public.profiles p
  WHERE p.role = 'tradie';

-- anon could not read profiles before this migration and must not gain reads
-- from it. authenticated only.
REVOKE ALL ON public.public_tradie_profiles FROM anon, authenticated;
GRANT SELECT ON public.public_tradie_profiles TO authenticated;

COMMENT ON VIEW public.public_tradie_profiles IS
  'Stranger-safe projection of tradie profiles for discovery. Never add a column '
  'that identifies or contacts a person: no email, phone, address, abn_number, '
  'license_number, documents_url or stripe_* id.';

-- ============================================================
-- 3. Guard the SECURITY DEFINER RPCs that took a caller-supplied identity
-- ============================================================

-- Backs 7 RLS policies on messages / conversations / conversation_participants /
-- conversation_permissions, every one calling it with auth.uid(). The signature
-- and language stay exactly as they were: still SQL so it still inlines into
-- those policies, and still returns the same rows for the legitimate caller.
-- Only the cross-user case changes, from "leaks" to "empty".
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(uid uuid)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT conversation_id
  FROM conversation_participants
  WHERE user_id = uid
    AND (uid = (SELECT auth.uid()) OR public.is_service_role());
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(conv_id uuid, user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT (user_id = (SELECT auth.uid()) OR public.is_service_role())
     AND EXISTS (
       SELECT 1 FROM conversations WHERE id = conv_id AND created_by = user_id
     );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_job_tracking(p_job_id uuid, p_uid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT (p_uid = (SELECT auth.uid()) OR public.is_service_role())
     AND (
       EXISTS (SELECT 1 FROM public.jobs j
                WHERE j.id = p_job_id AND (j.client_id = p_uid OR j.tradie_id = p_uid))
       OR EXISTS (
         SELECT 1 FROM public.site_visit_events e
         JOIN public.business_team_members b
           ON b.member_profile_id = e.tradie_id AND b.business_owner_id = p_uid
         WHERE e.job_id = p_job_id
       )
     );
$function$;

CREATE OR REPLACE FUNCTION public.has_user_engagement(user_uuid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT (user_uuid = (SELECT auth.uid()) OR public.is_service_role())
     AND EXISTS (SELECT 1 FROM jobs WHERE client_id = user_uuid LIMIT 1);
$function$;

-- Had no authorisation whatsoever. Restrict to the two sides of the recurring
-- job plus the worker themselves and their business owner.
CREATE OR REPLACE FUNCTION public.get_service_worker_details(p_recurring_job_id uuid)
  RETURNS TABLE(worker_name text, employment_type text, trade_specialty text,
                declared_trades text[], verified_trades text[], abn_verified boolean,
                license_verified boolean, identity_verified boolean,
                qualifications text[], white_card text, business_name text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(p.full_name, btm.invite_name),
    COALESCE(p.employment_type, btm.role),
    btm.trade_specialty,
    COALESCE(p.declared_trades, ARRAY[]::text[]),
    COALESCE(p.verified_trades, ARRAY[]::text[]),
    COALESCE(p.abn_verified, false),
    COALESCE(p.license_verified, false),
    COALESCE(p.is_identity_verified, false),
    COALESCE(td.qualifications, ARRAY[]::text[]),
    td.white_card,
    owner_td.business_name
  FROM recurring_jobs rj
  JOIN business_team_members btm ON btm.id = rj.assigned_team_member_id
  LEFT JOIN profiles p ON p.id = btm.member_profile_id
  LEFT JOIN tradie_details td ON td.profile_id = btm.member_profile_id
  LEFT JOIN tradie_details owner_td ON owner_td.profile_id = rj.tradie_id
  WHERE rj.id = p_recurring_job_id
    AND (
      public.is_service_role()
      OR rj.tradie_id = (SELECT auth.uid())
      OR rj.client_id = (SELECT auth.uid())
      OR btm.member_profile_id = (SELECT auth.uid())
      OR btm.business_owner_id = (SELECT auth.uid())
    );
$function$;

-- The caller controlled the ILIKE pattern, so '%' listed every tradie. Escape
-- the wildcards so the term is matched literally.
CREATE OR REPLACE FUNCTION public.search_businesses_by_name(search_term text)
  RETURNS TABLE(profile_id uuid, business_name text, trade_category text, full_name text)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT
    td.profile_id,
    td.business_name,
    td.trade_category,
    p.full_name
  FROM tradie_details td
  JOIN profiles p ON p.id = td.profile_id
  WHERE
    td.business_name ILIKE '%' ||
      replace(replace(replace(search_term, '\', '\\'), '%', '\%'), '_', '\_')
      || '%' ESCAPE '\'
    AND p.role = 'tradie'
    AND LENGTH(search_term) >= 2
  ORDER BY td.business_name
  LIMIT 10;
$function$;

-- ============================================================
-- 4. Close the self-approval route to role = 'tradie'
-- ============================================================
-- employer_approve_member sets role='tradie' and runs as DEFINER (owner
-- postgres), so lock_profile_billing_columns waves it through. A user could
-- point employer_id at THEMSELVES, set employer_status='pending_approval'
-- (neither column is locked), then call this on their own id.
--
-- The columns stay writable: Onboarding.tsx:140-142 legitimately self-sets both
-- when an employee requests to join a business, and blocking that outright is
-- what bricked signup on 2026-07-26. Only the self-referential case is refused.
CREATE OR REPLACE FUNCTION public.employer_approve_member(member_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF member_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own membership'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET employer_status = 'active',
      role = 'tradie'
  WHERE id = member_id
    AND employer_id = auth.uid()
    AND employer_status = 'pending_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or member not found';
  END IF;

  INSERT INTO business_team_members
    (business_owner_id, member_profile_id, invite_name, invite_email, trade_specialty, role, status, joined_at)
  SELECT
    auth.uid(),
    p.id,
    COALESCE(p.full_name, ''),
    p.email,
    COALESCE(td.trade_category, ''),
    CASE WHEN p.employment_type IN ('employee','subcontractor') THEN p.employment_type ELSE 'employee' END,
    'active',
    now()
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = member_id
  ON CONFLICT (business_owner_id, member_profile_id)
  DO UPDATE SET status = 'active', joined_at = COALESCE(business_team_members.joined_at, now());
END;
$function$;

-- Second line of defence, on the column writes themselves: you may name an
-- employer, but not yourself, and you may not promote yourself to 'active'.
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

  -- You cannot be your own employer — that was the self-approval route into
  -- employer_approve_member, and no real workforce relationship looks like it.
  IF NEW.employer_id IS NOT NULL AND NEW.employer_id = NEW.id THEN
    RAISE EXCEPTION 'employer_id cannot reference the profile itself'
      USING ERRCODE = '42501';
  END IF;

  -- Requesting to join ('pending_approval') or withdrawing ('none'/'rejected')
  -- is self-service. Becoming 'active' is the employer's decision, taken through
  -- employer_approve_member.
  IF NEW.employer_status IS DISTINCT FROM OLD.employer_status
     AND COALESCE(NEW.employer_status, '') NOT IN ('pending_approval', 'none', 'rejected') THEN
    RAISE EXCEPTION 'employer_status can only be set to pending_approval, none or rejected by a user'
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
-- 5. Advisor: pin the last mutable search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_tradie_cost_settings_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
