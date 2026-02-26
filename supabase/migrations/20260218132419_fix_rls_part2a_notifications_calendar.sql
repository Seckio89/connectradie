/*
  # Fix RLS Part 2a - notifications and calendar_integrations
*/

-- notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- calendar_integrations
DROP POLICY IF EXISTS "Tradies can view own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Tradies can insert own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Tradies can update own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Tradies can delete own calendar integrations" ON public.calendar_integrations;

CREATE POLICY "Tradies can view own calendar integrations" ON public.calendar_integrations
  FOR SELECT TO authenticated
  USING (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can insert own calendar integrations" ON public.calendar_integrations
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can update own calendar integrations" ON public.calendar_integrations
  FOR UPDATE TO authenticated
  USING (tradie_id = (select auth.uid()))
  WITH CHECK (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can delete own calendar integrations" ON public.calendar_integrations
  FOR DELETE TO authenticated
  USING (tradie_id = (select auth.uid()));
