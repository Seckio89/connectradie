-- Restore 26 RLS policies that exist in production but are created by no
-- migration in this repo. Fourth companion to 20260728043000 / 044500 / 101500;
-- see audit-findings/2026-07-28-repo-rebuild-gaps.md.
--
-- All 26 are PERMISSIVE. Postgres OR's permissive policies, so their absence
-- NARROWS access — a database rebuilt from this repo fails closed, breaking
-- features rather than leaking data. That is the safe direction, but it means a
-- rebuild silently loses access to private profile data, saved payment methods,
-- client sites, quote templates and typing indicators. profile_private's three
-- policies are the only grant letting an owner read their own bank details.
--
-- Definitions are copied from production's pg_policies. DROP IF EXISTS before
-- each CREATE keeps this idempotent, so it is a no-op against production.
--
-- `is_admin()` is referenced by several of these and already exists in the repo.

-- ── account_removals ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users and admins can read removal records" ON public.account_removals;
CREATE POLICY "Users and admins can read removal records" ON public.account_removals
  FOR SELECT USING (
    (user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles
                WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

DROP POLICY IF EXISTS "Users and admins can insert removal records" ON public.account_removals;
CREATE POLICY "Users and admins can insert removal records" ON public.account_removals
  FOR INSERT WITH CHECK (
    (user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.profiles
                WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

-- ── client_errors ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert client errors" ON public.client_errors;
CREATE POLICY "Authenticated users can insert client errors" ON public.client_errors
  FOR INSERT TO authenticated
  WITH CHECK (message IS NOT NULL AND length(message) > 0 AND length(message) <= 10000);

-- ── client_sites ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cs_owner_all" ON public.client_sites;
CREATE POLICY "cs_owner_all" ON public.client_sites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_contacts cc
                  WHERE cc.id = client_sites.client_contact_id AND cc.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_contacts cc
                       WHERE cc.id = client_sites.client_contact_id AND cc.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "cs_service_all" ON public.client_sites;
CREATE POLICY "cs_service_all" ON public.client_sites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── custom_task_suggestions ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "cts_read_approved" ON public.custom_task_suggestions;
CREATE POLICY "cts_read_approved" ON public.custom_task_suggestions
  FOR SELECT TO authenticated USING (status = 'approved'::text);

DROP POLICY IF EXISTS "cts_admin_read" ON public.custom_task_suggestions;
CREATE POLICY "cts_admin_read" ON public.custom_task_suggestions
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "cts_admin_update" ON public.custom_task_suggestions;
CREATE POLICY "cts_admin_update" ON public.custom_task_suggestions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "cts_service_all" ON public.custom_task_suggestions;
CREATE POLICY "cts_service_all" ON public.custom_task_suggestions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── fee_audit_anomalies ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view fee anomalies" ON public.fee_audit_anomalies;
CREATE POLICY "Admins can view fee anomalies" ON public.fee_audit_anomalies
  FOR SELECT TO authenticated USING (is_admin());

-- ── imported_calendar_visits ────────────────────────────────────────────────

DROP POLICY IF EXISTS "owner manages imported visits" ON public.imported_calendar_visits;
CREATE POLICY "owner manages imported visits" ON public.imported_calendar_visits
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = business_owner_id)
  WITH CHECK ((SELECT auth.uid()) = business_owner_id);

-- ── lead_impressions ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users insert own impressions" ON public.lead_impressions;
CREATE POLICY "Users insert own impressions" ON public.lead_impressions
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = tradie_id)
    OR EXISTS (SELECT 1 FROM public.jobs
                WHERE jobs.id = lead_impressions.job_id AND jobs.client_id = (SELECT auth.uid()))
  );

-- ── notifications ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- ── profile_private ─────────────────────────────────────────────────────────
-- The only grant letting an owner reach their own bank details.

DROP POLICY IF EXISTS "Owner or admin can view private profile data" ON public.profile_private;
CREATE POLICY "Owner or admin can view private profile data" ON public.profile_private
  FOR SELECT TO authenticated
  USING ((profile_id = (SELECT auth.uid())) OR is_admin());

DROP POLICY IF EXISTS "Owner can insert own private profile data" ON public.profile_private;
CREATE POLICY "Owner can insert own private profile data" ON public.profile_private
  FOR INSERT TO authenticated WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owner can update own private profile data" ON public.profile_private;
CREATE POLICY "Owner can update own private profile data" ON public.profile_private
  FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- ── profiles ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users and admins can delete profiles" ON public.profiles;
CREATE POLICY "Users and admins can delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING ((id = (SELECT auth.uid())) OR is_admin());

-- ── quote_templates ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "qt_owner_all" ON public.quote_templates;
CREATE POLICY "qt_owner_all" ON public.quote_templates
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = tradie_id)
  WITH CHECK ((SELECT auth.uid()) = tradie_id);

DROP POLICY IF EXISTS "qt_service_all" ON public.quote_templates;
CREATE POLICY "qt_service_all" ON public.quote_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── saved_payment_methods ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view relevant saved payment methods" ON public.saved_payment_methods;
CREATE POLICY "Authenticated users can view relevant saved payment methods" ON public.saved_payment_methods
  FOR SELECT TO authenticated
  USING ((client_id = (SELECT auth.uid())) OR (tradie_id = (SELECT auth.uid())));

-- ── site_visit_events ───────────────────────────────────────────────────────
-- Self-reported START_* is always allowed; geofence ENTER/EXIT only for the
-- job's tradie or one of their team members.

DROP POLICY IF EXISTS "Tradies log own site events" ON public.site_visit_events;
CREATE POLICY "Tradies log own site events" ON public.site_visit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (tradie_id = (SELECT auth.uid()))
    AND (
      (action = ANY (ARRAY['START_ONSITE'::text, 'START_OFFSITE'::text]))
      OR (
        (action = ANY (ARRAY['ENTER'::text, 'EXIT'::text]))
        AND EXISTS (
          SELECT 1 FROM public.jobs j
           WHERE j.id = site_visit_events.job_id
             AND (
               j.tradie_id = (SELECT auth.uid())
               OR EXISTS (SELECT 1 FROM public.business_team_members b
                           WHERE b.business_owner_id = j.tradie_id
                             AND b.member_profile_id = (SELECT auth.uid()))
             )
        )
      )
    )
  );

-- ── tradie_details ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users and admins can delete tradie_details" ON public.tradie_details;
CREATE POLICY "Users and admins can delete tradie_details" ON public.tradie_details
  FOR DELETE TO authenticated
  USING ((profile_id = (SELECT auth.uid())) OR is_admin());

-- ── typing_indicators ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view typing in their conversations" ON public.typing_indicators;
CREATE POLICY "Users can view typing in their conversations" ON public.typing_indicators
  FOR SELECT USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (SELECT 1 FROM public.conversation_participants cp
                WHERE cp.conversation_id = typing_indicators.conversation_id
                  AND cp.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert their own typing status" ON public.typing_indicators;
CREATE POLICY "Users can insert their own typing status" ON public.typing_indicators
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own typing status" ON public.typing_indicators;
CREATE POLICY "Users can update their own typing status" ON public.typing_indicators
  FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own typing status" ON public.typing_indicators;
CREATE POLICY "Users can delete their own typing status" ON public.typing_indicators
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
