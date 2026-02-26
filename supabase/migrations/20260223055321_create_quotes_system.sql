/*
  # Create Quotes System

  1. New Tables
    - `quotes`
      - `id` (uuid, primary key)
      - `job_id` (uuid, references jobs) - the job being quoted on
      - `tradie_id` (uuid, references profiles) - the tradie submitting the quote
      - `price_min` (numeric) - lower end of price range (stage 1)
      - `price_max` (numeric) - upper end of price range (stage 1)
      - `firm_price` (numeric, nullable) - locked-in firm quote (stage 2)
      - `message` (text) - tradie's approach/message to client
      - `estimated_duration` (text, nullable) - how long the job will take
      - `includes_materials` (boolean) - whether quote includes materials
      - `requires_site_inspection` (boolean) - tradie needs to visit before firm quote
      - `status` (text) - pending/accepted/declined/withdrawn/expired
      - `accepted_at` (timestamptz, nullable) - when client accepted this quote
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Modified Tables
    - `jobs` - add quote tracking columns:
      - `max_quotes` (integer, default 5) - max quotes allowed per job
      - `quote_count` (integer, default 0) - current number of quotes
      - `allows_site_inspection` (boolean, default true) - whether client permits site visits
      - `quoting_status` (text, default 'open') - open/closed/awarded

  3. Security
    - Enable RLS on `quotes` table
    - Tradies can view and create their own quotes
    - Clients can view quotes on their jobs
    - Tradies CANNOT see other tradies' quotes (blind quoting)
    - Clients can update quote status (accept/decline)

  4. Important Notes
    - Quotes are blind: tradies never see competing quote amounts
    - Max 5 quotes per job by default (configurable per job)
    - Two-stage quoting: range first, firm price optional
    - Site inspection flag allows tradie to defer firm pricing
*/

-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_min numeric NOT NULL CHECK (price_min >= 0),
  price_max numeric NOT NULL CHECK (price_max >= price_min),
  firm_price numeric CHECK (firm_price >= 0),
  message text NOT NULL DEFAULT '',
  estimated_duration text,
  includes_materials boolean NOT NULL DEFAULT false,
  requires_site_inspection boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, tradie_id)
);

-- Add quote tracking columns to jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'max_quotes'
  ) THEN
    ALTER TABLE jobs ADD COLUMN max_quotes integer NOT NULL DEFAULT 5;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'quote_count'
  ) THEN
    ALTER TABLE jobs ADD COLUMN quote_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'allows_site_inspection'
  ) THEN
    ALTER TABLE jobs ADD COLUMN allows_site_inspection boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'quoting_status'
  ) THEN
    ALTER TABLE jobs ADD COLUMN quoting_status text NOT NULL DEFAULT 'open' CHECK (quoting_status IN ('open', 'closed', 'awarded'));
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_job_id ON quotes(job_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tradie_id ON quotes(tradie_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_jobs_quoting_status ON jobs(quoting_status);

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Tradies can view their own quotes
CREATE POLICY "Tradies can view own quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

-- Clients can view quotes on their jobs (but NOT other tradies' contact info - handled in app)
CREATE POLICY "Clients can view quotes on their jobs"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = quotes.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Tradies can insert quotes on open jobs
CREATE POLICY "Tradies can submit quotes on open jobs"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = tradie_id
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = quotes.job_id
      AND jobs.status = 'pending'
      AND jobs.quoting_status = 'open'
      AND jobs.quote_count < jobs.max_quotes
    )
  );

-- Tradies can update their own quotes (withdraw, update price)
CREATE POLICY "Tradies can update own quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);

-- Clients can update quotes on their jobs (accept/decline)
CREATE POLICY "Clients can update quotes on their jobs"
  ON quotes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = quotes.job_id
      AND jobs.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = quotes.job_id
      AND jobs.client_id = auth.uid()
    )
  );

-- Tradies can delete (withdraw) their own quotes
CREATE POLICY "Tradies can delete own quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (auth.uid() = tradie_id);

-- Function to auto-increment quote_count when a quote is inserted
CREATE OR REPLACE FUNCTION increment_quote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE jobs
  SET quote_count = quote_count + 1,
      quoting_status = CASE
        WHEN quote_count + 1 >= max_quotes THEN 'closed'
        ELSE quoting_status
      END
  WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-decrement quote_count when a quote is deleted
CREATE OR REPLACE FUNCTION decrement_quote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE jobs
  SET quote_count = GREATEST(0, quote_count - 1),
      quoting_status = CASE
        WHEN quoting_status = 'closed' AND quote_count - 1 < max_quotes THEN 'open'
        ELSE quoting_status
      END
  WHERE id = OLD.job_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle quote acceptance (assign tradie, close quoting)
CREATE OR REPLACE FUNCTION handle_quote_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    NEW.accepted_at = now();
    
    UPDATE jobs
    SET tradie_id = NEW.tradie_id,
        status = 'accepted',
        quoting_status = 'awarded'
    WHERE id = NEW.job_id;

    UPDATE quotes
    SET status = 'declined',
        updated_at = now()
    WHERE job_id = NEW.job_id
      AND id != NEW.id
      AND status = 'pending';
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS on_quote_insert ON quotes;
CREATE TRIGGER on_quote_insert
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION increment_quote_count();

DROP TRIGGER IF EXISTS on_quote_delete ON quotes;
CREATE TRIGGER on_quote_delete
  AFTER DELETE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION decrement_quote_count();

DROP TRIGGER IF EXISTS on_quote_update ON quotes;
CREATE TRIGGER on_quote_update
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION handle_quote_acceptance();

-- Create notification trigger for new quotes
CREATE OR REPLACE FUNCTION notify_client_new_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_job_description text;
  v_client_id uuid;
  v_tradie_name text;
BEGIN
  SELECT description, client_id INTO v_job_description, v_client_id
  FROM jobs WHERE id = NEW.job_id;

  SELECT full_name INTO v_tradie_name
  FROM profiles WHERE id = NEW.tradie_id;

  INSERT INTO notifications (user_id, title, message, type, channel, metadata, job_id)
  VALUES (
    v_client_id,
    'New Quote Received',
    'A tradie has submitted a quote on your job: ' || LEFT(v_job_description, 80),
    'new_quote',
    'in_app',
    jsonb_build_object('job_id', NEW.job_id, 'quote_id', NEW.id),
    NEW.job_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_quote_notify ON quotes;
CREATE TRIGGER on_new_quote_notify
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION notify_client_new_quote();
