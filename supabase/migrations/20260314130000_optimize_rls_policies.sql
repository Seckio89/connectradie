-- Optimize RLS policies flagged by Supabase Performance Advisor
-- 1. Cache auth.uid() in subqueries to avoid per-row re-evaluation
-- 2. Consolidate multiple permissive policies on same table+cmd

-- ============================================================
-- JOBS: Consolidate 2 DELETE policies → 1, fix bare auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Clients can delete their own pending jobs" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can delete their declined jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON public.jobs;

CREATE POLICY "Users can delete own jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    ((SELECT auth.uid()) = client_id AND status IN ('pending', 'cancelled', 'declined'))
    OR
    ((SELECT auth.uid()) = tradie_id AND status = 'declined')
  );

-- ============================================================
-- QUOTES: Consolidate 2 DELETE policies → 1, fix bare auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Tradies can delete own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Clients can delete quotes on their own jobs" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete relevant quotes" ON public.quotes;

CREATE POLICY "Users can delete relevant quotes" ON public.quotes
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = tradie_id
    OR EXISTS (
      SELECT 1 FROM jobs WHERE jobs.id = quotes.job_id AND jobs.client_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- NOTIFICATIONS: Fix bare auth.uid() in INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "Allow notification inserts for job participants" ON public.notifications;

CREATE POLICY "Allow notification inserts for job participants" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = notifications.job_id AND jobs.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.job_id = notifications.job_id AND quotes.tradie_id = (SELECT auth.uid())
    )
    OR user_id = (SELECT auth.uid())
  );

-- ============================================================
-- RECURRING_INVOICES: Consolidate 2 SELECT policies → 1, fix bare auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Homeowner can read own invoices" ON public.recurring_invoices;
DROP POLICY IF EXISTS "Tradie can read own invoices" ON public.recurring_invoices;
DROP POLICY IF EXISTS "Users can read own invoices" ON public.recurring_invoices;

CREATE POLICY "Users can read own invoices" ON public.recurring_invoices
  FOR SELECT TO authenticated
  USING (
    homeowner_id = (SELECT auth.uid())
    OR tradie_id = (SELECT auth.uid())
  );

-- ============================================================
-- RECURRING_SESSIONS: Consolidate 2 ALL policies → 1
-- ============================================================
DROP POLICY IF EXISTS "Homeowner can manage their own sessions" ON public.recurring_sessions;
DROP POLICY IF EXISTS "Tradie can manage sessions for their recurring jobs" ON public.recurring_sessions;
DROP POLICY IF EXISTS "Users can manage relevant sessions" ON public.recurring_sessions;

CREATE POLICY "Users can manage relevant sessions" ON public.recurring_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
      AND (rj.client_id = (SELECT auth.uid()) OR rj.tradie_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_jobs rj
      WHERE rj.id = recurring_sessions.recurring_job_id
      AND (rj.client_id = (SELECT auth.uid()) OR rj.tradie_id = (SELECT auth.uid()))
    )
  );

-- ============================================================
-- TRADIE_AVAILABILITY: Replace ALL + SELECT overlap
-- ============================================================
DROP POLICY IF EXISTS "Tradie can manage own availability" ON public.tradie_availability;
DROP POLICY IF EXISTS "Tradie can insert own availability" ON public.tradie_availability;
DROP POLICY IF EXISTS "Tradie can update own availability" ON public.tradie_availability;
DROP POLICY IF EXISTS "Tradie can delete own availability" ON public.tradie_availability;

CREATE POLICY "Tradie can insert own availability" ON public.tradie_availability
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (SELECT auth.uid()));

CREATE POLICY "Tradie can update own availability" ON public.tradie_availability
  FOR UPDATE TO authenticated
  USING (tradie_id = (SELECT auth.uid()))
  WITH CHECK (tradie_id = (SELECT auth.uid()));

CREATE POLICY "Tradie can delete own availability" ON public.tradie_availability
  FOR DELETE TO authenticated
  USING (tradie_id = (SELECT auth.uid()));

-- ============================================================
-- SERVICE_DESCRIPTION_RAW: Fix bare auth.uid()
-- ============================================================
DROP POLICY IF EXISTS "Clients can insert own descriptions" ON public.service_description_raw;

CREATE POLICY "Clients can insert own descriptions" ON public.service_description_raw
  FOR INSERT TO authenticated
  WITH CHECK (client_id = (SELECT auth.uid()));
