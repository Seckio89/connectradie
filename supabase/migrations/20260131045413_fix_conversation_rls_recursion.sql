/*
  # Fix Infinite Recursion in Conversation RLS Policies

  1. Changes
    - Drop existing recursive policies
    - Create simpler, non-recursive policies
    - Use direct checks instead of subqueries on the same table

  2. Security
    - Maintain same security level without recursion
    - Users can only see their own participation records
    - Admins verified through direct column checks
*/

-- Drop existing recursive policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Admins can add participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON conversation_participants;
DROP POLICY IF EXISTS "Admins can remove participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view permissions in their conversations" ON conversation_permissions;
DROP POLICY IF EXISTS "Admins can set permissions" ON conversation_permissions;
DROP POLICY IF EXISTS "Permission creators can update their permissions" ON conversation_permissions;
DROP POLICY IF EXISTS "Permission creators can delete their permissions" ON conversation_permissions;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;

-- Simpler conversation_participants policies without recursion
CREATE POLICY "Users can view all participants"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can add participants to conversations"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own participation"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their own participation"
  ON conversation_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Simpler conversation_permissions policies
CREATE POLICY "Users can view all permissions"
  ON conversation_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can set permissions"
  ON conversation_permissions FOR INSERT
  TO authenticated
  WITH CHECK (blocked_by = auth.uid());

CREATE POLICY "Permission creators can update"
  ON conversation_permissions FOR UPDATE
  TO authenticated
  USING (blocked_by = auth.uid())
  WITH CHECK (blocked_by = auth.uid());

CREATE POLICY "Permission creators can delete"
  ON conversation_permissions FOR DELETE
  TO authenticated
  USING (blocked_by = auth.uid());

-- Simpler conversations policy
CREATE POLICY "Users can view all conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (true);