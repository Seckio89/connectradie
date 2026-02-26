/*
  # Create onboarding progress and hints tracking

  1. New Tables
    - `onboarding_progress`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `profile_complete` (boolean, default false)
      - `avatar_complete` (boolean, default false)
      - `trades_added` (boolean, default false)
      - `availability_set` (boolean, default false)
      - `first_job_viewed` (boolean, default false)
      - `completed_at` (timestamp, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `hint_tracking`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `hint_key` (text, unique per user)
      - `dismissed_at` (timestamp)
      - `view_count` (integer, default 0)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Users can only view/edit their own records
*/

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_complete boolean DEFAULT false,
  avatar_complete boolean DEFAULT false,
  trades_added boolean DEFAULT false,
  availability_set boolean DEFAULT false,
  first_job_viewed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS hint_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hint_key text NOT NULL,
  dismissed_at timestamptz,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, hint_key)
);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE hint_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding progress"
  ON onboarding_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding progress"
  ON onboarding_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert onboarding progress"
  ON onboarding_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own hint tracking"
  ON hint_tracking
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert hint tracking"
  ON hint_tracking
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update hint tracking"
  ON hint_tracking
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);