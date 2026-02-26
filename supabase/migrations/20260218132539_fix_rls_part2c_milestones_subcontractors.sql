/*
  # Fix RLS Part 2c - job_milestones and milestone_subcontractors
*/

-- job_milestones
DROP POLICY IF EXISTS "Tradies can create milestones for their jobs" ON public.job_milestones;
DROP POLICY IF EXISTS "Tradies can view milestones for their jobs" ON public.job_milestones;
DROP POLICY IF EXISTS "Clients can view milestones for their jobs" ON public.job_milestones;
DROP POLICY IF EXISTS "Tradies can update pending milestones" ON public.job_milestones;
DROP POLICY IF EXISTS "Clients can approve or pay milestones" ON public.job_milestones;
DROP POLICY IF EXISTS "Tradies can delete pending milestones" ON public.job_milestones;

CREATE POLICY "Tradies can view milestones for their jobs" ON public.job_milestones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.tradie_id = (select auth.uid())));

CREATE POLICY "Clients can view milestones for their jobs" ON public.job_milestones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.client_id = (select auth.uid())));

CREATE POLICY "Tradies can create milestones for their jobs" ON public.job_milestones
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid()) AND
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.tradie_id = (select auth.uid()))
  );

CREATE POLICY "Tradies can update pending milestones" ON public.job_milestones
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.tradie_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.tradie_id = (select auth.uid())));

CREATE POLICY "Clients can approve or pay milestones" ON public.job_milestones
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.client_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.client_id = (select auth.uid())));

CREATE POLICY "Tradies can delete pending milestones" ON public.job_milestones
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.tradie_id = (select auth.uid())));

-- milestone_subcontractors
DROP POLICY IF EXISTS "Users can view subcontractors for their job milestones" ON public.milestone_subcontractors;
DROP POLICY IF EXISTS "Users can insert subcontractors for their job milestones" ON public.milestone_subcontractors;
DROP POLICY IF EXISTS "Users can update subcontractors for their job milestones" ON public.milestone_subcontractors;
DROP POLICY IF EXISTS "Users can delete subcontractors for their job milestones" ON public.milestone_subcontractors;

CREATE POLICY "Users can view subcontractors for their job milestones" ON public.milestone_subcontractors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_milestones m JOIN public.jobs j ON j.id = m.job_id
      WHERE m.id = milestone_id AND (j.tradie_id = (select auth.uid()) OR j.client_id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can insert subcontractors for their job milestones" ON public.milestone_subcontractors
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_milestones m JOIN public.jobs j ON j.id = m.job_id
      WHERE m.id = milestone_id AND j.tradie_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update subcontractors for their job milestones" ON public.milestone_subcontractors
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_milestones m JOIN public.jobs j ON j.id = m.job_id
      WHERE m.id = milestone_id AND j.tradie_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_milestones m JOIN public.jobs j ON j.id = m.job_id
      WHERE m.id = milestone_id AND j.tradie_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete subcontractors for their job milestones" ON public.milestone_subcontractors
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_milestones m JOIN public.jobs j ON j.id = m.job_id
      WHERE m.id = milestone_id AND j.tradie_id = (select auth.uid())
    )
  );
