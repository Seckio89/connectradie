-- Add read_by array for group conversation read tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by uuid[];

-- Create typing indicators table
CREATE TABLE IF NOT EXISTS typing_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_typing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own typing status" ON typing_indicators
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Typing visibility: members of the conversation can see typing status
DO $$ BEGIN
  CREATE POLICY "Conversation members can view typing" ON typing_indicators
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = typing_indicators.conversation_id
        AND cp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
