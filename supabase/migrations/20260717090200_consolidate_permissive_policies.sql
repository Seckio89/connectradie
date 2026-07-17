-- Migration: consolidate_permissive_policies
-- Type: Performance (RLS policy consolidation)
-- Description: Advisor 0006 — multiple permissive policies on the same
-- table/role/action force Postgres to evaluate every policy for every query.
-- Permissive policies are OR'd together, so merging their USING clauses (and
-- WITH CHECK clauses) with OR into a single policy is SEMANTICALLY IDENTICAL
-- while halving policy evaluations on hot tables.
--
-- All expressions below are copied verbatim from the live pg_policies
-- definitions (2026-07-17) and merged with OR — no access change.
--
-- Also fixes: time_entries policies were scoped to role `public` (which
-- includes anon) — rescoped to `authenticated`.

-- ============================================================
-- 1. jobs — split "Tradies manage jobs for own contacts" (ALL) into the
--    four per-command policies it overlapped with
-- ============================================================
-- tc(...) shorthand used in comments below:
--   tradie_id = (SELECT auth.uid())
--   AND client_contact_id IN (SELECT id FROM client_contacts
--                             WHERE owner_id = (SELECT auth.uid()))

DROP POLICY IF EXISTS "Tradies manage jobs for own contacts" ON public.jobs;
DROP POLICY IF EXISTS "Users can view relevant jobs" ON public.jobs;
DROP POLICY IF EXISTS "Clients can create jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can update relevant jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON public.jobs;

CREATE POLICY "jobs_select_participant_or_open"
  ON public.jobs FOR SELECT TO authenticated
  USING (
    (client_id = (SELECT auth.uid()))
    OR (tradie_id = (SELECT auth.uid()))
    OR ((status = 'pending'::text) AND (tradie_id IS NULL))
    OR is_admin()
    -- merged from "Tradies manage jobs for own contacts":
    OR ((tradie_id = (SELECT auth.uid())) AND (client_contact_id IN (
          SELECT client_contacts.id FROM client_contacts
          WHERE client_contacts.owner_id = (SELECT auth.uid()))))
  );

CREATE POLICY "jobs_insert_client_or_tradie_contact"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (
    (client_id = (SELECT auth.uid()))
    -- merged from "Tradies manage jobs for own contacts":
    OR ((tradie_id = (SELECT auth.uid())) AND (client_contact_id IN (
          SELECT client_contacts.id FROM client_contacts
          WHERE client_contacts.owner_id = (SELECT auth.uid()))))
  );

CREATE POLICY "jobs_update_participant_or_tradie_contact"
  ON public.jobs FOR UPDATE TO authenticated
  USING (
    (client_id = (SELECT auth.uid()))
    OR (tradie_id = (SELECT auth.uid()))
    OR is_admin()
    OR ((tradie_id = (SELECT auth.uid())) AND (client_contact_id IN (
          SELECT client_contacts.id FROM client_contacts
          WHERE client_contacts.owner_id = (SELECT auth.uid()))))
  )
  WITH CHECK (
    (client_id = (SELECT auth.uid()))
    OR ((tradie_id = (SELECT auth.uid())) AND is_tradie_verified((SELECT auth.uid())))
    OR is_admin()
    OR ((tradie_id = (SELECT auth.uid())) AND (client_contact_id IN (
          SELECT client_contacts.id FROM client_contacts
          WHERE client_contacts.owner_id = (SELECT auth.uid()))))
  );

CREATE POLICY "jobs_delete_own_or_tradie_contact"
  ON public.jobs FOR DELETE TO authenticated
  USING (
    (((SELECT auth.uid()) = client_id)
      AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text, 'declined'::text])))
    OR (((SELECT auth.uid()) = tradie_id)
      AND ((status = 'declined'::text)
        OR ((client_id IS NULL)
          AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text, 'expired'::text])))))
    OR ((tradie_id = (SELECT auth.uid())) AND (client_contact_id IN (
          SELECT client_contacts.id FROM client_contacts
          WHERE client_contacts.owner_id = (SELECT auth.uid()))))
  );

-- ============================================================
-- 2. invoices — merge duplicate SELECT and UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS "Billed users can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view accessible invoices" ON public.invoices;
DROP POLICY IF EXISTS "Billed users can update their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;

CREATE POLICY "invoices_select_accessible"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    (billed_to_user_id = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = invoices.job_id
        AND ((j.client_id = (SELECT auth.uid())) OR (j.tradie_id = (SELECT auth.uid())))))
  );

CREATE POLICY "invoices_update_owner_or_billed"
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    (billed_to_user_id = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    (billed_to_user_id = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
  );

-- ============================================================
-- 3. business_team_members — merge duplicate INSERT policies
-- ============================================================
DROP POLICY IF EXISTS "Business owner can insert team members" ON public.business_team_members;
DROP POLICY IF EXISTS "Members can request to join a team" ON public.business_team_members;

CREATE POLICY "business_team_members_insert_owner_or_self"
  ON public.business_team_members FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = business_owner_id)
    OR ((SELECT auth.uid()) = member_profile_id)
  );

-- ============================================================
-- 4. job_contact_details — merge duplicate SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Assigned tradie reads funded job contact" ON public.job_contact_details;
DROP POLICY IF EXISTS "Client reads own job contact" ON public.job_contact_details;

CREATE POLICY "job_contact_details_select_participant"
  ON public.job_contact_details FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_contact_details.job_id
        AND (
          (j.client_id = (SELECT auth.uid()))
          OR ((j.tradie_id = (SELECT auth.uid()))
            AND (j.status = ANY (ARRAY['funded'::text, 'in_progress'::text, 'completed'::text])))
        )
    )
  );

-- ============================================================
-- 5. recurring_jobs — split ALL policy so SELECT is a single policy
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own recurring jobs" ON public.recurring_jobs;
DROP POLICY IF EXISTS "Assigned worker can view service" ON public.recurring_jobs;

CREATE POLICY "recurring_jobs_select_party_or_worker"
  ON public.recurring_jobs FOR SELECT TO authenticated
  USING (
    ((SELECT auth.uid()) = client_id)
    OR ((SELECT auth.uid()) = tradie_id)
    OR (assigned_team_member_id IN (
      SELECT business_team_members.id FROM business_team_members
      WHERE business_team_members.member_profile_id = (SELECT auth.uid())))
  );

CREATE POLICY "recurring_jobs_insert_party"
  ON public.recurring_jobs FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = client_id) OR ((SELECT auth.uid()) = tradie_id)
  );

CREATE POLICY "recurring_jobs_update_party"
  ON public.recurring_jobs FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = client_id) OR ((SELECT auth.uid()) = tradie_id))
  WITH CHECK (((SELECT auth.uid()) = client_id) OR ((SELECT auth.uid()) = tradie_id));

CREATE POLICY "recurring_jobs_delete_party"
  ON public.recurring_jobs FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = client_id) OR ((SELECT auth.uid()) = tradie_id));

-- ============================================================
-- 6. recurring_sessions — split ALL policy so SELECT is a single policy
-- ============================================================
DROP POLICY IF EXISTS "Users can manage relevant sessions" ON public.recurring_sessions;
DROP POLICY IF EXISTS "Assigned worker can view service sessions" ON public.recurring_sessions;

CREATE POLICY "recurring_sessions_select_party_or_worker"
  ON public.recurring_sessions FOR SELECT TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND ((rj.client_id = (SELECT auth.uid())) OR (rj.tradie_id = (SELECT auth.uid())))))
    OR (recurring_job_id IN (
      SELECT rj.id
      FROM recurring_jobs rj
      JOIN business_team_members btm ON btm.id = rj.assigned_team_member_id
      WHERE btm.member_profile_id = (SELECT auth.uid())))
  );

CREATE POLICY "recurring_sessions_insert_party"
  ON public.recurring_sessions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND ((rj.client_id = (SELECT auth.uid())) OR (rj.tradie_id = (SELECT auth.uid()))))
  );

CREATE POLICY "recurring_sessions_update_party"
  ON public.recurring_sessions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND ((rj.client_id = (SELECT auth.uid())) OR (rj.tradie_id = (SELECT auth.uid()))))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND ((rj.client_id = (SELECT auth.uid())) OR (rj.tradie_id = (SELECT auth.uid()))))
  );

CREATE POLICY "recurring_sessions_delete_party"
  ON public.recurring_sessions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
        AND ((rj.client_id = (SELECT auth.uid())) OR (rj.tradie_id = (SELECT auth.uid()))))
  );

-- ============================================================
-- 7. site_visit_events — merge duplicate SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Clients read site visit events for their jobs" ON public.site_visit_events;
DROP POLICY IF EXISTS "Tradies read own site visit events" ON public.site_visit_events;

CREATE POLICY "site_visit_events_select_tradie_or_client"
  ON public.site_visit_events FOR SELECT TO authenticated
  USING (
    (tradie_id = (SELECT auth.uid()))
    OR (job_id IN (
      SELECT jobs.id FROM jobs
      WHERE jobs.client_id = (SELECT auth.uid())))
  );

-- ============================================================
-- 8. time_entries — rescope from `public` role to `authenticated`
--    and split owner-ALL so SELECT is a single policy
-- ============================================================
DROP POLICY IF EXISTS "Business owners can manage time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Workers can view own time entries" ON public.time_entries;

CREATE POLICY "time_entries_select_owner_or_worker"
  ON public.time_entries FOR SELECT TO authenticated
  USING (
    ((SELECT auth.uid()) = business_owner_id)
    OR ((SELECT auth.uid()) = team_member_id)
  );

CREATE POLICY "time_entries_insert_owner"
  ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = business_owner_id);

CREATE POLICY "time_entries_update_owner"
  ON public.time_entries FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = business_owner_id)
  WITH CHECK ((SELECT auth.uid()) = business_owner_id);

CREATE POLICY "time_entries_delete_owner"
  ON public.time_entries FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = business_owner_id);
