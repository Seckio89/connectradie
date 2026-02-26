/*
  # Service Reminders (Retention Engine)

  1. New Tables
    - `trade_categories`
      - `id` (uuid, primary key)
      - `name` (text, unique) - category name matching tradie_details.trade_category
      - `default_reminder_months` (integer) - months after completion to remind client
      - `created_at` (timestamptz)
    - `service_reminders`
      - `id` (uuid, primary key)
      - `client_id` (uuid, FK to profiles) - the client who completed the job
      - `tradie_id` (uuid, FK to profiles) - the tradie who performed the job
      - `job_id` (uuid, FK to jobs) - the completed job
      - `category_name` (text) - trade category snapshot from the job
      - `location_address` (text) - address snapshot for rebooking
      - `due_date` (date) - when the reminder is due
      - `status` (text) - pending, sent, booked, dismissed
      - `created_at` (timestamptz)

  2. Seed Data
    - Common Australian trade categories with recommended service intervals

  3. Automation
    - Trigger `schedule_reminder_on_completion` fires when job status changes to 'completed'
    - Looks up category's default_reminder_months
    - Creates a service_reminder record with calculated due_date
    - Creates a notification for the client when a reminder becomes due (within 30 days)

  4. Security
    - RLS enabled on both tables
    - trade_categories: readable by all authenticated users
    - service_reminders: clients can read/update their own reminders
*/

-- Trade Categories reference table
CREATE TABLE IF NOT EXISTS trade_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  default_reminder_months integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trade_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trade categories"
  ON trade_categories
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Seed common categories with reminder intervals
INSERT INTO trade_categories (name, default_reminder_months) VALUES
  ('plumber', 12),
  ('electrician', 12),
  ('air_conditioning', 6),
  ('pest_control', 12),
  ('gardener', 1),
  ('landscaper', 3),
  ('painter', 36),
  ('carpenter', 24),
  ('roofer', 12),
  ('tiler', 24),
  ('cleaner', 1),
  ('locksmith', 0),
  ('handyman', 6),
  ('pool_maintenance', 3),
  ('solar', 12),
  ('fencer', 24),
  ('plasterer', 24),
  ('concreter', 0),
  ('demolition', 0),
  ('appliance_repair', 12),
  ('garage_doors', 12),
  ('security_systems', 12),
  ('waterproofing', 24),
  ('general', 0),
  ('chef', 0),
  ('bartender', 0),
  ('barista', 0),
  ('waiter', 0),
  ('kitchen_hand', 0),
  ('event_staff', 0)
ON CONFLICT (name) DO NOTHING;

-- Service Reminders table
CREATE TABLE IF NOT EXISTS service_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id),
  tradie_id uuid NOT NULL REFERENCES profiles(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  category_name text NOT NULL DEFAULT '',
  location_address text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own service reminders"
  ON service_reminders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can update own service reminders"
  ON service_reminders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "System can insert service reminders"
  ON service_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE INDEX IF NOT EXISTS idx_service_reminders_client_id ON service_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_due_date ON service_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_service_reminders_status ON service_reminders(status);

-- Trigger function: auto-schedule reminder when job completes
CREATE OR REPLACE FUNCTION schedule_reminder_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_category text;
  v_reminder_months integer;
  v_due date;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    SELECT td.trade_category INTO v_category
    FROM tradie_details td
    WHERE td.profile_id = NEW.tradie_id;

    IF v_category IS NOT NULL THEN
      SELECT tc.default_reminder_months INTO v_reminder_months
      FROM trade_categories tc
      WHERE tc.name = v_category;

      IF v_reminder_months IS NOT NULL AND v_reminder_months > 0 THEN
        v_due := CURRENT_DATE + (v_reminder_months || ' months')::interval;

        INSERT INTO service_reminders (client_id, tradie_id, job_id, category_name, location_address, due_date, status)
        VALUES (NEW.client_id, NEW.tradie_id, NEW.job_id, v_category, NEW.location_address, v_due, 'pending');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_schedule_reminder_on_completion ON jobs;
CREATE TRIGGER trg_schedule_reminder_on_completion
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION schedule_reminder_on_completion();

-- Function to create notifications for approaching reminders
CREATE OR REPLACE FUNCTION notify_approaching_reminders()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT sr.id, sr.client_id, sr.category_name, sr.due_date, sr.tradie_id,
           p.full_name as tradie_name
    FROM service_reminders sr
    JOIN profiles p ON p.id = sr.tradie_id
    WHERE sr.status = 'pending'
      AND sr.due_date <= CURRENT_DATE + interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.metadata->>'reminder_id' = sr.id::text
          AND n.type = 'service_reminder'
      )
  LOOP
    INSERT INTO notifications (user_id, title, message, type, metadata)
    VALUES (
      r.client_id,
      'Maintenance Due: ' || replace(initcap(replace(r.category_name, '_', ' ')), '_', ' '),
      'Your ' || replace(r.category_name, '_', ' ') || ' service with ' || r.tradie_name || ' is due for maintenance. Book again to stay on schedule!',
      'service_reminder',
      jsonb_build_object('reminder_id', r.id::text, 'tradie_id', r.tradie_id::text, 'category', r.category_name)
    );

    UPDATE service_reminders SET status = 'sent' WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
