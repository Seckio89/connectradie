/*
  # Fix RLS auth.uid() Performance & Consolidate Remaining Permissive Policies

  ## 1. Wraps all bare auth.uid() calls in (select auth.uid()) to prevent per-row re-evaluation
  ## 2. Consolidates multiple permissive SELECT/UPDATE/DELETE policies on the same table+role
  ## 3. Removes duplicate stripe_orders SELECT policy
  ## 4. Removes overly permissive contact_messages INSERT policy (was WITH CHECK true)

  Tables affected: app_settings, business_join_requests, business_team_members, client_errors,
  contact_messages, date_change_requests, hint_tracking, job_team_assignments, job_variations,
  jobs, onboarding_progress, payments, phase_team_assignments, portfolio_images, profile_views,
  profiles, project_phases, projects, quotes, reviews, service_reminders, stripe_customers,
  stripe_orders, stripe_subscriptions, system_settings, trade_categories, vacancy_applications
*/

-- app_settings: Fix UPDATE
DROP POLICY IF EXISTS "Admin can update app settings" ON public.app_settings;
CREATE POLICY "Admin can update app settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND lower(profiles.email) = 'admin@tradie.com'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND lower(profiles.email) = 'admin@tradie.com'));

-- business_join_requests: Fix INSERT and UPDATE
DROP POLICY IF EXISTS "Requester can insert join request" ON public.business_join_requests;
CREATE POLICY "Requester can insert join request" ON public.business_join_requests
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = requester_id);

DROP POLICY IF EXISTS "Business owner can update request status" ON public.business_join_requests;
CREATE POLICY "Business owner can update request status" ON public.business_join_requests
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = business_owner_id)
  WITH CHECK ((select auth.uid()) = business_owner_id);

-- business_team_members: Fix INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Business owner can insert team members" ON public.business_team_members;
CREATE POLICY "Business owner can insert team members" ON public.business_team_members
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can update team members" ON public.business_team_members;
CREATE POLICY "Business owner can update team members" ON public.business_team_members
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = business_owner_id)
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can delete team members" ON public.business_team_members;
CREATE POLICY "Business owner can delete team members" ON public.business_team_members
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = business_owner_id);

-- client_errors: Fix SELECT
DROP POLICY IF EXISTS "Admins can read client errors" ON public.client_errors;
CREATE POLICY "Admins can read client errors" ON public.client_errors
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- contact_messages: Remove open INSERT, fix rate-limited policies, fix admin policies
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;

DROP POLICY IF EXISTS "Anonymous users can submit limited contact messages" ON public.contact_messages;
CREATE POLICY "Anonymous users can submit limited contact messages" ON public.contact_messages
  FOR INSERT TO anon
  WITH CHECK ((SELECT count(*) FROM contact_messages cm WHERE cm.created_at > (now() - interval '1 hour')) < 20);

DROP POLICY IF EXISTS "Authenticated users can submit contact messages" ON public.contact_messages;
CREATE POLICY "Authenticated users can submit contact messages" ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT count(*) FROM contact_messages cm
    WHERE cm.email = (SELECT users.email FROM auth.users WHERE users.id = (select auth.uid()))::text
    AND cm.created_at > (now() - interval '1 hour')) < 10);

DROP POLICY IF EXISTS "Admins can read contact messages" ON public.contact_messages;
CREATE POLICY "Admins can read contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;
CREATE POLICY "Admins can update contact messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- date_change_requests: Fix INSERT and UPDATE
DROP POLICY IF EXISTS "Tradies can create date change requests" ON public.date_change_requests;
CREATE POLICY "Tradies can create date change requests" ON public.date_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = requester_id
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.project_id = date_change_requests.project_id
      AND jobs.tradie_id = (select auth.uid())
      AND jobs.status = ANY(ARRAY['accepted','in_progress','completed'])
    )
  );

DROP POLICY IF EXISTS "Clients can respond to date change requests" ON public.date_change_requests;
CREATE POLICY "Clients can respond to date change requests" ON public.date_change_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = date_change_requests.project_id AND projects.client_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = date_change_requests.project_id AND projects.client_id = (select auth.uid())));

-- hint_tracking: Fix all 3
DROP POLICY IF EXISTS "Users can insert hint tracking" ON public.hint_tracking;
CREATE POLICY "Users can insert hint tracking" ON public.hint_tracking
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own hint tracking" ON public.hint_tracking;
CREATE POLICY "Users can view own hint tracking" ON public.hint_tracking
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update hint tracking" ON public.hint_tracking;
CREATE POLICY "Users can update hint tracking" ON public.hint_tracking
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- job_team_assignments: Fix INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Business owner can insert job assignments" ON public.job_team_assignments;
CREATE POLICY "Business owner can insert job assignments" ON public.job_team_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can update job assignments" ON public.job_team_assignments;
CREATE POLICY "Business owner can update job assignments" ON public.job_team_assignments
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = business_owner_id)
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can delete job assignments" ON public.job_team_assignments;
CREATE POLICY "Business owner can delete job assignments" ON public.job_team_assignments
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = business_owner_id);

-- job_variations: Fix INSERT and UPDATE
DROP POLICY IF EXISTS "Tradies can create variations for their jobs" ON public.job_variations;
CREATE POLICY "Tradies can create variations for their jobs" ON public.job_variations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_variations.job_id AND jobs.tradie_id = (select auth.uid())));

DROP POLICY IF EXISTS "Clients can update variations for their jobs" ON public.job_variations;
CREATE POLICY "Clients can update variations for their jobs" ON public.job_variations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_variations.job_id AND jobs.client_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_variations.job_id AND jobs.client_id = (select auth.uid())));

-- jobs: Consolidate SELECT (2->1) and UPDATE (3->1)
DROP POLICY IF EXISTS "Users can view relevant jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can view all jobs" ON public.jobs;
CREATE POLICY "Users can view relevant jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    client_id = (select auth.uid())
    OR tradie_id = (select auth.uid())
    OR (status = 'pending' AND tradie_id IS NULL)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Clients can update own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Verified tradies can update assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can update any jobs" ON public.jobs;
CREATE POLICY "Users can update relevant jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    client_id = (select auth.uid())
    OR tradie_id = (select auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    client_id = (select auth.uid())
    OR (tradie_id = (select auth.uid()) AND is_tradie_verified((select auth.uid())))
    OR is_admin()
  );

-- onboarding_progress: Fix all 3
DROP POLICY IF EXISTS "System can insert onboarding progress" ON public.onboarding_progress;
CREATE POLICY "System can insert onboarding progress" ON public.onboarding_progress
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own onboarding progress" ON public.onboarding_progress;
CREATE POLICY "Users can view own onboarding progress" ON public.onboarding_progress
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own onboarding progress" ON public.onboarding_progress;
CREATE POLICY "Users can update own onboarding progress" ON public.onboarding_progress
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- payments: Fix INSERT, consolidate SELECT (2->1)
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can insert own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Users can view relevant payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = profile_id OR is_admin());

-- phase_team_assignments: Fix all 4
DROP POLICY IF EXISTS "Business owner can insert phase assignments" ON public.phase_team_assignments;
CREATE POLICY "Business owner can insert phase assignments" ON public.phase_team_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can manage phase assignments" ON public.phase_team_assignments;
CREATE POLICY "Business owner can manage phase assignments" ON public.phase_team_assignments
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can update phase assignments" ON public.phase_team_assignments;
CREATE POLICY "Business owner can update phase assignments" ON public.phase_team_assignments
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = business_owner_id)
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can delete phase assignments" ON public.phase_team_assignments;
CREATE POLICY "Business owner can delete phase assignments" ON public.phase_team_assignments
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = business_owner_id);

-- portfolio_images: Fix INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Tradies can insert own portfolio images" ON public.portfolio_images;
CREATE POLICY "Tradies can insert own portfolio images" ON public.portfolio_images
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = tradie_id);

DROP POLICY IF EXISTS "Tradies can update own portfolio images" ON public.portfolio_images;
CREATE POLICY "Tradies can update own portfolio images" ON public.portfolio_images
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = tradie_id)
  WITH CHECK ((select auth.uid()) = tradie_id);

DROP POLICY IF EXISTS "Tradies can delete own portfolio images" ON public.portfolio_images;
CREATE POLICY "Tradies can delete own portfolio images" ON public.portfolio_images
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = tradie_id);

-- profile_views: Fix INSERT and SELECT
DROP POLICY IF EXISTS "Users can insert own profile views" ON public.profile_views;
CREATE POLICY "Users can insert own profile views" ON public.profile_views
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = viewer_id);

DROP POLICY IF EXISTS "Users can read own profile views" ON public.profile_views;
CREATE POLICY "Users can read own profile views" ON public.profile_views
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = viewer_id);

-- profiles: Consolidate SELECT (merge Employers into main policy)
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Employers can view linked employee profiles" ON public.profiles;
CREATE POLICY "Users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR role = 'tradie'
    OR is_admin()
    OR employer_id = (select auth.uid())
  );

-- project_phases: Fix all 4
DROP POLICY IF EXISTS "Business owner can insert project phases" ON public.project_phases;
CREATE POLICY "Business owner can insert project phases" ON public.project_phases
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can manage project phases" ON public.project_phases;
CREATE POLICY "Business owner can manage project phases" ON public.project_phases
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can update project phases" ON public.project_phases;
CREATE POLICY "Business owner can update project phases" ON public.project_phases
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = business_owner_id)
  WITH CHECK ((select auth.uid()) = business_owner_id);

DROP POLICY IF EXISTS "Business owner can delete project phases" ON public.project_phases;
CREATE POLICY "Business owner can delete project phases" ON public.project_phases
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = business_owner_id);

-- projects: Fix INSERT and DELETE
DROP POLICY IF EXISTS "Clients can create own projects" ON public.projects;
CREATE POLICY "Clients can create own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = client_id);

DROP POLICY IF EXISTS "Clients can delete own projects" ON public.projects;
CREATE POLICY "Clients can delete own projects" ON public.projects
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = client_id);

-- quotes: Consolidate SELECT (2->1) and UPDATE (2->1)
DROP POLICY IF EXISTS "Clients can view quotes on their jobs" ON public.quotes;
DROP POLICY IF EXISTS "Tradies can view own quotes" ON public.quotes;
CREATE POLICY "Users can view relevant quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = tradie_id
    OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = quotes.job_id AND jobs.client_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Clients can update quotes on their jobs" ON public.quotes;
DROP POLICY IF EXISTS "Tradies can update own quotes" ON public.quotes;
CREATE POLICY "Users can update relevant quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    (select auth.uid()) = tradie_id
    OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = quotes.job_id AND jobs.client_id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) = tradie_id
    OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = quotes.job_id AND jobs.client_id = (select auth.uid()))
  );

-- reviews: Consolidate DELETE (2->1)
DROP POLICY IF EXISTS "Admins can delete reviews" ON public.reviews;
DROP POLICY IF EXISTS "Review authors can delete their own reviews" ON public.reviews;
CREATE POLICY "Users can delete reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (client_id = (select auth.uid()) OR is_admin());

-- service_reminders: Fix SELECT and UPDATE
DROP POLICY IF EXISTS "Clients can read own service reminders" ON public.service_reminders;
CREATE POLICY "Clients can read own service reminders" ON public.service_reminders
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = client_id);

DROP POLICY IF EXISTS "Clients can update own service reminders" ON public.service_reminders;
CREATE POLICY "Clients can update own service reminders" ON public.service_reminders
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = client_id)
  WITH CHECK ((select auth.uid()) = client_id);

-- stripe_customers: Fix SELECT
DROP POLICY IF EXISTS "Users can view their own customer data" ON public.stripe_customers;
CREATE POLICY "Users can view their own customer data" ON public.stripe_customers
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) AND deleted_at IS NULL);

-- stripe_orders: Fix and consolidate SELECT (remove duplicate)
DROP POLICY IF EXISTS "Users can view their own order data" ON public.stripe_orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.stripe_orders;
CREATE POLICY "Users can view their own orders" ON public.stripe_orders
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT stripe_customers.customer_id FROM stripe_customers
      WHERE stripe_customers.user_id = (select auth.uid()) AND stripe_customers.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- stripe_subscriptions: Consolidate SELECT (2->1)
DROP POLICY IF EXISTS "Admins can view all stripe subscriptions" ON public.stripe_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.stripe_subscriptions;
CREATE POLICY "Users can view relevant subscriptions" ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = profile_id OR is_admin());

-- system_settings: Fix SELECT and UPDATE
DROP POLICY IF EXISTS "Authenticated users can read system settings" ON public.system_settings;
CREATE POLICY "Authenticated users can read system settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Only admins can update system settings" ON public.system_settings;
CREATE POLICY "Only admins can update system settings" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'admin'));

-- trade_categories: Fix SELECT
DROP POLICY IF EXISTS "Authenticated users can read trade categories" ON public.trade_categories;
CREATE POLICY "Authenticated users can read trade categories" ON public.trade_categories
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- vacancy_applications: Consolidate SELECT (2->1)
DROP POLICY IF EXISTS "Applicants can view own applications" ON public.vacancy_applications;
DROP POLICY IF EXISTS "Employers can view applications on their vacancies" ON public.vacancy_applications;
CREATE POLICY "Users can view relevant applications" ON public.vacancy_applications
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = applicant_id
    OR EXISTS (
      SELECT 1 FROM trade_vacancies
      WHERE trade_vacancies.id = vacancy_applications.vacancy_id
      AND trade_vacancies.employer_id = (select auth.uid())
    )
  );
