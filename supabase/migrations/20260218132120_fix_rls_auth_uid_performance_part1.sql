/*
  # Fix RLS Auth UID Performance - Part 1

  Replace auth.uid() with (select auth.uid()) for profiles, tradie_details,
  my_trades, availability_slots, jobs, connections, job_unlocks, reviews,
  and conversation tables.
*/

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()) OR role = 'tradie');

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- tradie_details
DROP POLICY IF EXISTS "Tradies can view their own details" ON public.tradie_details;
DROP POLICY IF EXISTS "Tradies can update their own details" ON public.tradie_details;
DROP POLICY IF EXISTS "Tradies can insert their own details" ON public.tradie_details;

CREATE POLICY "Tradies can view their own details" ON public.tradie_details
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));

CREATE POLICY "Tradies can update their own details" ON public.tradie_details
  FOR UPDATE TO authenticated
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

CREATE POLICY "Tradies can insert their own details" ON public.tradie_details
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = (select auth.uid()));

-- my_trades
DROP POLICY IF EXISTS "Clients can view their saved trades" ON public.my_trades;
DROP POLICY IF EXISTS "Clients can save trades" ON public.my_trades;
DROP POLICY IF EXISTS "Clients can remove saved trades" ON public.my_trades;

CREATE POLICY "Clients can view their saved trades" ON public.my_trades
  FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

CREATE POLICY "Clients can save trades" ON public.my_trades
  FOR INSERT TO authenticated
  WITH CHECK (client_id = (select auth.uid()));

CREATE POLICY "Clients can remove saved trades" ON public.my_trades
  FOR DELETE TO authenticated
  USING (client_id = (select auth.uid()));

-- availability_slots
DROP POLICY IF EXISTS "Tradies can manage their availability" ON public.availability_slots;

CREATE POLICY "Tradies can manage their availability" ON public.availability_slots
  FOR ALL TO authenticated
  USING (tradie_id = (select auth.uid()))
  WITH CHECK (tradie_id = (select auth.uid()));

-- jobs
DROP POLICY IF EXISTS "Clients can view their jobs" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can view jobs assigned to them" ON public.jobs;
DROP POLICY IF EXISTS "Clients can create jobs" ON public.jobs;
DROP POLICY IF EXISTS "Both parties can update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can delete their declined jobs" ON public.jobs;
DROP POLICY IF EXISTS "Tradies can browse pending leads" ON public.jobs;

CREATE POLICY "Clients can view their jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (client_id = (select auth.uid()));

CREATE POLICY "Tradies can view jobs assigned to them" ON public.jobs
  FOR SELECT TO authenticated
  USING (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can browse pending leads" ON public.jobs
  FOR SELECT TO authenticated
  USING (status = 'pending' AND tradie_id IS NULL);

CREATE POLICY "Clients can create jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (client_id = (select auth.uid()));

CREATE POLICY "Both parties can update jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (client_id = (select auth.uid()) OR tradie_id = (select auth.uid()))
  WITH CHECK (client_id = (select auth.uid()) OR tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can delete their declined jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (tradie_id = (select auth.uid()) AND status = 'declined');

-- connections
DROP POLICY IF EXISTS "Tradies can view own connections" ON public.connections;
DROP POLICY IF EXISTS "Tradies can create connections" ON public.connections;

CREATE POLICY "Tradies can view own connections" ON public.connections
  FOR SELECT TO authenticated
  USING (tradie_id = (select auth.uid()) OR client_id = (select auth.uid()));

CREATE POLICY "Tradies can create connections" ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (select auth.uid()));

-- job_unlocks
DROP POLICY IF EXISTS "Tradies can view own job unlocks" ON public.job_unlocks;
DROP POLICY IF EXISTS "Tradies can create job unlocks" ON public.job_unlocks;

CREATE POLICY "Tradies can view own job unlocks" ON public.job_unlocks
  FOR SELECT TO authenticated
  USING (tradie_id = (select auth.uid()));

CREATE POLICY "Tradies can create job unlocks" ON public.job_unlocks
  FOR INSERT TO authenticated
  WITH CHECK (tradie_id = (select auth.uid()));

-- reviews
DROP POLICY IF EXISTS "Clients can create reviews for their completed jobs" ON public.reviews;
DROP POLICY IF EXISTS "Review authors can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Review authors can delete their own reviews" ON public.reviews;

CREATE POLICY "Clients can create reviews for their completed jobs" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (client_id = (select auth.uid()));

CREATE POLICY "Review authors can update their own reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (client_id = (select auth.uid()))
  WITH CHECK (client_id = (select auth.uid()));

CREATE POLICY "Review authors can delete their own reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (client_id = (select auth.uid()));

-- conversations
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Conversation creators can update" ON public.conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;

CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = id AND cp.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Conversation creators can update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

-- messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages to mark as read" ON public.messages;
DROP POLICY IF EXISTS "Users can soft-delete their own messages" ON public.messages;

CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid())))
  );

CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid()) AND
    conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid())))
  );

CREATE POLICY "Users can update messages to mark as read" ON public.messages
  FOR UPDATE TO authenticated
  USING (conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))))
  WITH CHECK (conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))));

CREATE POLICY "Users can soft-delete their own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid()))
  WITH CHECK (sender_id = (select auth.uid()));

-- conversation_participants
DROP POLICY IF EXISTS "Users can view participants in own conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to own conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can remove their own participation" ON public.conversation_participants;

CREATE POLICY "Users can view participants in own conversations" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))));

CREATE POLICY "Users can add participants to own conversations" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.created_by = (select auth.uid())
    )
  );

CREATE POLICY "Users can update their own participation" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can remove their own participation" ON public.conversation_participants
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- conversation_permissions
DROP POLICY IF EXISTS "Users can view own conversation permissions" ON public.conversation_permissions;
DROP POLICY IF EXISTS "Users can set permissions" ON public.conversation_permissions;
DROP POLICY IF EXISTS "Permission creators can update" ON public.conversation_permissions;
DROP POLICY IF EXISTS "Permission creators can delete" ON public.conversation_permissions;

CREATE POLICY "Users can view own conversation permissions" ON public.conversation_permissions
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT public.get_user_conversation_ids((select auth.uid()))));

CREATE POLICY "Users can set permissions" ON public.conversation_permissions
  FOR INSERT TO authenticated
  WITH CHECK (blocked_by = (select auth.uid()));

CREATE POLICY "Permission creators can update" ON public.conversation_permissions
  FOR UPDATE TO authenticated
  USING (blocked_by = (select auth.uid()))
  WITH CHECK (blocked_by = (select auth.uid()));

CREATE POLICY "Permission creators can delete" ON public.conversation_permissions
  FOR DELETE TO authenticated
  USING (blocked_by = (select auth.uid()));
