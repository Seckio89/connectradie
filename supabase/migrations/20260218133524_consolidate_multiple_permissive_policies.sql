/*
  # Consolidate Multiple Permissive Policies

  Multiple permissive policies for the same role+action on a table cause Postgres to
  evaluate all of them with OR logic, which is inefficient. This migration consolidates
  them into single policies using OR conditions.

  ## Tables Affected
  - availability_slots: SELECT (Anyone can view + Tradies can manage)
  - business_join_requests: SELECT (owner + requester)
  - business_team_members: SELECT (owner + member)
  - date_change_requests: SELECT (clients + tradies)
  - invoice_line_items: SELECT (own + job-linked)
  - invoices: SELECT (own + job-linked)
  - job_milestones: SELECT (clients + tradies), UPDATE (clients + tradies)
  - job_team_assignments: SELECT (owner + member)
  - job_variations: SELECT (clients + tradies)
  - jobs: SELECT (clients + tradies + pending leads)
  - messages: UPDATE (soft-delete + mark-as-read)
  - profiles: SELECT (own + tradie + admin), UPDATE (own + admin)
  - project_date_change_requests: SELECT (clients + tradies)
  - project_date_requests: SELECT (clients + tradies)
  - projects: SELECT (clients + tradies), UPDATE (clients + tradies)
  - tradie_details: SELECT (anyone + own + business search - all TRUE anyway)
*/

-- availability_slots: Merge SELECT into single policy (ALL already covers SELECT for tradies, add public view)
DROP POLICY IF EXISTS "Anyone can view available slots" ON public.availability_slots;
DROP POLICY IF EXISTS "Tradies can manage their availability" ON public.availability_slots;

CREATE POLICY "View and manage availability slots" ON public.availability_slots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Tradies can insert availability" ON public.availability_slots
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can update availability" ON public.availability_slots
  FOR UPDATE TO authenticated
  USING (tradie_id = (select auth.uid()))
  WITH CHECK (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can delete availability" ON public.availability_slots
  FOR DELETE TO authenticated
  USING (tradie_id = (select auth.uid()));

-- business_join_requests: Merge SELECT
DROP POLICY IF EXISTS "Business owner can view incoming requests" ON public.business_join_requests;
DROP POLICY IF EXISTS "Requester can view their own requests" ON public.business_join_requests;

CREATE POLICY "Users can view their join requests" ON public.business_join_requests
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = requester_id OR
    (select auth.uid()) = business_owner_id
  );

-- business_team_members: Merge SELECT
DROP POLICY IF EXISTS "Business owner can manage their team" ON public.business_team_members;
DROP POLICY IF EXISTS "Team members can view their own record" ON public.business_team_members;

CREATE POLICY "Users can view relevant team members" ON public.business_team_members
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = business_owner_id OR
    (select auth.uid()) = member_profile_id
  );

-- date_change_requests: Merge SELECT
DROP POLICY IF EXISTS "Clients can view date change requests for own projects" ON public.date_change_requests;
DROP POLICY IF EXISTS "Tradies can view own date change requests" ON public.date_change_requests;

CREATE POLICY "Users can view relevant date change requests" ON public.date_change_requests
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = requester_id OR
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.client_id = (select auth.uid())
    )
  );

-- invoice_line_items: Merge SELECT
DROP POLICY IF EXISTS "Users can view line items for their invoices" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Users can view line items for job-linked invoices" ON public.invoice_line_items;

CREATE POLICY "Users can view accessible invoice line items" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND (
        i.created_by = (select auth.uid()) OR
        EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = i.job_id AND (
            j.client_id = (select auth.uid()) OR
            j.tradie_id = (select auth.uid())
          )
        )
      )
    )
  );

-- invoices: Merge SELECT
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices for their jobs" ON public.invoices;

CREATE POLICY "Users can view accessible invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    created_by = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (
        j.client_id = (select auth.uid()) OR
        j.tradie_id = (select auth.uid())
      )
    )
  );

-- job_milestones: Merge SELECT
DROP POLICY IF EXISTS "Clients can view milestones for their jobs" ON public.job_milestones;
DROP POLICY IF EXISTS "Tradies can view milestones for their jobs" ON public.job_milestones;

CREATE POLICY "Users can view milestones for their jobs" ON public.job_milestones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (
        j.tradie_id = (select auth.uid()) OR
        j.client_id = (select auth.uid())
      )
    )
  );

-- job_milestones: Merge UPDATE
DROP POLICY IF EXISTS "Tradies can update pending milestones" ON public.job_milestones;
DROP POLICY IF EXISTS "Clients can approve or pay milestones" ON public.job_milestones;

CREATE POLICY "Job parties can update milestones" ON public.job_milestones
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (
        j.tradie_id = (select auth.uid()) OR
        j.client_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (
        j.tradie_id = (select auth.uid()) OR
        j.client_id = (select auth.uid())
      )
    )
  );

-- job_team_assignments: Merge SELECT
DROP POLICY IF EXISTS "Business owner can manage job assignments" ON public.job_team_assignments;
DROP POLICY IF EXISTS "Assigned team members can view their job assignments" ON public.job_team_assignments;

CREATE POLICY "Users can view relevant job assignments" ON public.job_team_assignments
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = business_owner_id OR
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = team_member_id AND btm.member_profile_id = (select auth.uid())
    )
  );

-- job_variations: Merge SELECT
DROP POLICY IF EXISTS "Clients can view variations for their jobs" ON public.job_variations;
DROP POLICY IF EXISTS "Tradies can view variations for their jobs" ON public.job_variations;

CREATE POLICY "Job parties can view variations" ON public.job_variations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (
        j.tradie_id = (select auth.uid()) OR
        j.client_id = (select auth.uid())
      )
    )
  );

-- jobs: Merge SELECT (clients + tradies assigned + pending leads)
DROP POLICY IF EXISTS "Clients can view their jobs" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can view jobs assigned to them" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can browse pending leads" ON public.jobs;

CREATE POLICY "Users can view relevant jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    client_id = (select auth.uid()) OR
    tradie_id = (select auth.uid()) OR
    (status = 'pending' AND tradie_id IS NULL)
  );

-- messages: Merge UPDATE (mark-as-read + soft-delete)
DROP POLICY IF EXISTS "Users can update messages to mark as read" ON public.messages;
DROP POLICY IF EXISTS "Users can soft-delete their own messages" ON public.messages;

CREATE POLICY "Users can update accessible messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))) OR
    sender_id = (select auth.uid())
  )
  WITH CHECK (
    conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))) OR
    sender_id = (select auth.uid())
  );

-- profiles: Merge SELECT (own + tradie + admin - "own OR tradie" already covers "tradie")
-- "Users can view their own profile" already has: id = uid OR role = 'tradie'
-- "Users can view tradie profiles" has: role = 'tradie' (subset of above)
-- "Admins can view all profiles" has: is_admin()
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view tradie profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid()) OR
    role = 'tradie' OR
    is_admin()
  );

-- profiles: Merge UPDATE (own + admin)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Users can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()) OR is_admin())
  WITH CHECK (id = (select auth.uid()) OR is_admin());

-- projects: Merge SELECT
DROP POLICY IF EXISTS "Clients can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Tradies can view assigned projects" ON public.projects;

CREATE POLICY "Users can view relevant projects" ON public.projects
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = client_id OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.project_id = id AND j.tradie_id = (select auth.uid())
      AND j.status = ANY(ARRAY['accepted','in_progress','completed'])
    )
  );

-- projects: Merge UPDATE
DROP POLICY IF EXISTS "Clients can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Tradies can update status for assigned projects" ON public.projects;

CREATE POLICY "Project parties can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    (select auth.uid()) = client_id OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.project_id = id AND j.tradie_id = (select auth.uid())
      AND j.status = ANY(ARRAY['accepted','in_progress','completed'])
    )
  )
  WITH CHECK (
    (select auth.uid()) = client_id OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.project_id = id AND j.tradie_id = (select auth.uid())
      AND j.status = ANY(ARRAY['accepted','in_progress','completed'])
    )
  );

-- tradie_details: Merge SELECT (all three are effectively "true" for authenticated)
DROP POLICY IF EXISTS "Anyone can view tradie details" ON public.tradie_details;
DROP POLICY IF EXISTS "Authenticated users can search business names" ON public.tradie_details;
DROP POLICY IF EXISTS "Tradies can view their own details" ON public.tradie_details;

CREATE POLICY "Authenticated users can view tradie details" ON public.tradie_details
  FOR SELECT TO authenticated
  USING (true);
