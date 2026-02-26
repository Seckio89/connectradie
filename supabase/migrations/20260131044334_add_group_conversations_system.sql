/*
  # Add Group Conversations System

  1. New Tables
    - `conversations` - Track conversation threads (group or 1-to-1)
      - id (uuid, primary key)
      - title (text, optional for group chats)
      - is_group (boolean)
      - created_by (uuid)
      - created_at, updated_at (timestamptz)
    
    - `conversation_participants` - Track who is in each conversation
      - id (uuid, primary key)
      - conversation_id (uuid)
      - user_id (uuid)
      - joined_at (timestamptz)
      - left_at (timestamptz, nullable)
      - is_admin (boolean)
      - archived_at (timestamptz, nullable)
    
    - `conversation_permissions` - Track information visibility restrictions
      - id (uuid, primary key)
      - conversation_id (uuid)
      - user_id (uuid being restricted)
      - blocked_by (uuid who blocked them)
      - can_see_phone, can_see_email, can_see_address (boolean)
      - created_at (timestamptz)
    
  2. Update messages table
    - Add conversation_id (uuid)
    - Add deleted_at (timestamptz) for soft deletes

  3. Security
    - Enable RLS on all tables
    - Participants can only view their conversations
    - Admins can manage participants and permissions
    - Users can delete their own messages
    - Users can archive their own participation
*/

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  is_group boolean DEFAULT false NOT NULL,
  created_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create conversation_participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now() NOT NULL,
  left_at timestamptz,
  is_admin boolean DEFAULT false NOT NULL,
  archived_at timestamptz,
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Create conversation_permissions table
CREATE TABLE IF NOT EXISTS conversation_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  blocked_by uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  can_see_phone boolean DEFAULT true NOT NULL,
  can_see_email boolean DEFAULT true NOT NULL,
  can_see_address boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(conversation_id, user_id, blocked_by)
);

ALTER TABLE conversation_permissions ENABLE ROW LEVEL SECURITY;

-- Add new columns to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN conversation_id uuid REFERENCES conversations ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Migrate existing messages to conversations
-- Create conversations for each unique pair of users
INSERT INTO conversations (id, is_group, created_by, created_at)
SELECT 
  gen_random_uuid() as id,
  false as is_group,
  sender_id as created_by,
  MIN(created_at) as created_at
FROM messages
WHERE conversation_id IS NULL
GROUP BY 
  CASE 
    WHEN sender_id < receiver_id THEN sender_id || '-' || receiver_id
    ELSE receiver_id || '-' || sender_id
  END,
  sender_id
ON CONFLICT DO NOTHING;

-- Create a temporary function to help with migration
CREATE OR REPLACE FUNCTION get_or_create_conversation(p_user1 uuid, p_user2 uuid)
RETURNS uuid AS $func$
DECLARE
  v_conversation_id uuid;
  v_min_user uuid;
  v_max_user uuid;
BEGIN
  -- Ensure consistent ordering
  IF p_user1 < p_user2 THEN
    v_min_user := p_user1;
    v_max_user := p_user2;
  ELSE
    v_min_user := p_user2;
    v_max_user := p_user1;
  END IF;

  -- Try to find existing conversation
  SELECT c.id INTO v_conversation_id
  FROM conversations c
  INNER JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = v_min_user
  INNER JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = v_max_user
  WHERE c.is_group = false
  LIMIT 1;

  -- If not found, create new conversation
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (is_group, created_by)
    VALUES (false, v_min_user)
    RETURNING id INTO v_conversation_id;

    -- Add both participants
    INSERT INTO conversation_participants (conversation_id, user_id, is_admin)
    VALUES 
      (v_conversation_id, v_min_user, true),
      (v_conversation_id, v_max_user, true);
  END IF;

  RETURN v_conversation_id;
END;
$func$ LANGUAGE plpgsql;

-- Update messages with conversation_id
UPDATE messages m
SET conversation_id = get_or_create_conversation(m.sender_id, m.receiver_id)
WHERE m.conversation_id IS NULL;

-- Drop the temporary function
DROP FUNCTION IF EXISTS get_or_create_conversation;

-- RLS Policies for conversations
CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Conversation creators can update"
  ON conversations FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS Policies for conversation_participants
CREATE POLICY "Users can view participants in their conversations"
  ON conversation_participants FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

CREATE POLICY "Admins can add participants"
  ON conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND is_admin = true AND left_at IS NULL
    )
  );

CREATE POLICY "Users can update their own participation"
  ON conversation_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can remove participants"
  ON conversation_participants FOR DELETE
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND is_admin = true AND left_at IS NULL
    )
  );

-- RLS Policies for conversation_permissions
CREATE POLICY "Users can view permissions in their conversations"
  ON conversation_permissions FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

CREATE POLICY "Admins can set permissions"
  ON conversation_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    blocked_by = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND is_admin = true AND left_at IS NULL
    )
  );

CREATE POLICY "Permission creators can update their permissions"
  ON conversation_permissions FOR UPDATE
  TO authenticated
  USING (blocked_by = auth.uid())
  WITH CHECK (blocked_by = auth.uid());

CREATE POLICY "Permission creators can delete their permissions"
  ON conversation_permissions FOR DELETE
  TO authenticated
  USING (blocked_by = auth.uid());

-- Update messages RLS policies to use conversations
DROP POLICY IF EXISTS "Users can view their messages" ON messages;
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can update their received messages" ON messages;
CREATE POLICY "Users can update messages to mark as read"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

CREATE POLICY "Users can soft-delete their own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_archived ON conversation_participants(archived_at);
CREATE INDEX IF NOT EXISTS idx_conversation_permissions_conversation ON conversation_permissions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_permissions_user ON conversation_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at);

-- Create function to update conversation updated_at on new message
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update conversation timestamp
DROP TRIGGER IF EXISTS update_conversation_timestamp_trigger ON messages;
CREATE TRIGGER update_conversation_timestamp_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();