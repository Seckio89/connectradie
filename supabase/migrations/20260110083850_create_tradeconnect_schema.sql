/*
  # TradeConnect Complete Database Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `full_name` (text)
      - `role` (text, either 'client' or 'tradie')
      - `avatar_url` (text, nullable)
      - `phone` (text, nullable)
      - `address` (text, nullable)
      - `postcode` (text, nullable)
      - `created_at` (timestamptz)
      - `onboarding_completed` (boolean)

    - `tradie_details`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, references profiles)
      - `business_name` (text)
      - `trade_category` (text)
      - `abn` (text, nullable)
      - `license_number` (text, nullable)
      - `is_verified` (boolean)
      - `is_insured` (boolean)
      - `is_licensed` (boolean)
      - `subscription_tier` (text, 'free' or 'pro')
      - `service_radius_km` (integer)
      - `bio` (text, nullable)
      - `hourly_rate` (decimal, nullable)
      - `created_at` (timestamptz)

    - `my_trades`
      - `id` (uuid, primary key)
      - `client_id` (uuid, references profiles)
      - `tradie_id` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `availability_slots`
      - `id` (uuid, primary key)
      - `tradie_id` (uuid, references profiles)
      - `start_time` (timestamptz)
      - `end_time` (timestamptz)
      - `status` (text, 'available', 'booked', or 'blocked')
      - `created_at` (timestamptz)

    - `jobs`
      - `id` (uuid, primary key)
      - `client_id` (uuid, references profiles)
      - `tradie_id` (uuid, references profiles)
      - `description` (text)
      - `status` (text)
      - `scheduled_time` (timestamptz, nullable)
      - `images_url` (text array, nullable)
      - `created_at` (timestamptz)

    - `messages`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, references profiles)
      - `receiver_id` (uuid, references profiles)
      - `content` (text)
      - `image_url` (text, nullable)
      - `is_booking_request` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for viewing public tradie profiles
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text CHECK (role IN ('client', 'tradie')) DEFAULT NULL,
  avatar_url text,
  phone text,
  address text,
  postcode text,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view tradie profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (role = 'tradie');

-- Create tradie_details table
CREATE TABLE IF NOT EXISTS tradie_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  business_name text NOT NULL DEFAULT '',
  trade_category text NOT NULL DEFAULT 'general',
  abn text,
  license_number text,
  is_verified boolean DEFAULT false,
  is_insured boolean DEFAULT false,
  is_licensed boolean DEFAULT false,
  subscription_tier text CHECK (subscription_tier IN ('free', 'pro')) DEFAULT 'free',
  service_radius_km integer DEFAULT 25,
  bio text,
  hourly_rate decimal(10, 2),
  emergency_available boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id)
);

ALTER TABLE tradie_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tradies can view their own details"
  ON tradie_details FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Tradies can update their own details"
  ON tradie_details FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Tradies can insert their own details"
  ON tradie_details FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Anyone can view tradie details"
  ON tradie_details FOR SELECT
  TO authenticated
  USING (true);

-- Create my_trades table (client's saved tradies)
CREATE TABLE IF NOT EXISTS my_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  tradie_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, tradie_id)
);

ALTER TABLE my_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their saved trades"
  ON my_trades FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Clients can save trades"
  ON my_trades FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Clients can remove saved trades"
  ON my_trades FOR DELETE
  TO authenticated
  USING (client_id = auth.uid());

-- Create availability_slots table
CREATE TABLE IF NOT EXISTS availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text CHECK (status IN ('available', 'booked', 'blocked')) DEFAULT 'available',
  booked_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tradies can manage their availability"
  ON availability_slots FOR ALL
  TO authenticated
  USING (tradie_id = auth.uid())
  WITH CHECK (tradie_id = auth.uid());

CREATE POLICY "Anyone can view available slots"
  ON availability_slots FOR SELECT
  TO authenticated
  USING (true);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  tradie_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  status text CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  scheduled_time timestamptz,
  images_url text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Tradies can view jobs assigned to them"
  ON jobs FOR SELECT
  TO authenticated
  USING (tradie_id = auth.uid());

CREATE POLICY "Clients can create jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Both parties can update jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid() OR tradie_id = auth.uid())
  WITH CHECK (client_id = auth.uid() OR tradie_id = auth.uid());

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES profiles ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  image_url text,
  is_booking_request boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their messages"
  ON messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update their received messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_postcode ON profiles(postcode);
CREATE INDEX IF NOT EXISTS idx_tradie_details_category ON tradie_details(trade_category);
CREATE INDEX IF NOT EXISTS idx_tradie_details_verified ON tradie_details(is_verified);
CREATE INDEX IF NOT EXISTS idx_my_trades_client ON my_trades(client_id);
CREATE INDEX IF NOT EXISTS idx_availability_tradie ON availability_slots(tradie_id);
CREATE INDEX IF NOT EXISTS idx_availability_status ON availability_slots(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tradie ON jobs(tradie_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
