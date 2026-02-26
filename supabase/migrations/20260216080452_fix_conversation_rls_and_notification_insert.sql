/*
  # Fix overly permissive RLS policies

  1. Security Changes
    - Replace `USING(true)` on `conversations` SELECT with proper participant check
    - Replace `USING(true)` on `conversation_participants` SELECT with proper scoping
    - Replace `WITH CHECK(true)` on `conversation_participants` INSERT with auth check
    - Replace `USING(true)` on `conversation_permissions` SELECT with proper scoping
    - Replace `WITH CHECK(true)` on `notifications` INSERT with ownership check

  2. Notes
    - Uses a helper function to avoid RLS recursion between conversations and participants
    - Notifications can only be inserted for the authenticated user or via service role
*/

CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT conversation_id FROM conversation_participants WHERE user_id = uid;
$$;

DROP POLICY IF EXISTS "Users can view all conversations" ON conversations;
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "Users can view all participants" ON conversation_participants;
CREATE POLICY "Users can view participants in own conversations"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "Anyone can add participants to conversations" ON conversation_participants;
CREATE POLICY "Users can add participants to own conversations"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid()))
    OR NOT EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_participants.conversation_id)
  );

DROP POLICY IF EXISTS "Users can view all permissions" ON conversation_permissions;
CREATE POLICY "Users can view own conversation permissions"
  ON conversation_permissions FOR SELECT
  TO authenticated
  USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "Users can create own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
