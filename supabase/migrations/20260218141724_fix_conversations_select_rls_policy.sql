/*
  # Fix conversations SELECT RLS policy

  ## Problem
  The "Users can view own conversations" policy on the `conversations` table has
  a self-referencing bug. It checks `cp.conversation_id = cp.id` instead of
  `cp.conversation_id = conversations.id`, so the EXISTS subquery never matches
  and no conversations are returned. This causes the "Failed to load conversations"
  error on the Tradie Dashboard.

  ## Fix
  Drop the broken policy and recreate it with the correct join condition.
*/

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;

CREATE POLICY "Users can view own conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = (SELECT auth.uid())
    )
  );
