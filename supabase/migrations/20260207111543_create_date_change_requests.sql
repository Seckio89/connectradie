/*
  # Create Date Change Requests System

  ## Overview
  This migration creates a system for tradies to request date changes on projects.
  Only clients can directly edit project dates. Tradies must submit a request
  that the client can approve or reject.

  ## 1. New Tables
    - `date_change_requests`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `requester_id` (uuid, foreign key to auth.users) - the tradie requesting the change
      - `field_name` (text) - which date field to change ('start_date' or 'estimated_end_date')
      - `requested_date` (date) - the new date being requested
      - `reason` (text) - why the change is needed
      - `status` (text) - 'pending', 'approved', 'rejected'
      - `created_at` (timestamptz)
      - `responded_at` (timestamptz) - when the client responded

  ## 2. Security
    - Enable RLS on date_change_requests table
    - Tradies can create requests for projects they're assigned to
    - Tradies can view their own requests
    - Clients can view and respond to requests for their projects

  ## 3. Notifications
    - Function to notify client when a date change is requested
    - Function to notify tradie when their request is approved/rejected
*/

CREATE TABLE IF NOT EXISTS date_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL CHECK (field_name IN ('start_date', 'estimated_end_date')),
  requested_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE date_change_requests ENABLE ROW LEVEL SECURITY;

-- Tradies can create requests for projects they're assigned to
CREATE POLICY "Tradies can create date change requests"
  ON date_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.project_id = date_change_requests.project_id
      AND jobs.tradie_id = auth.uid()
      AND jobs.status IN ('accepted', 'in_progress', 'completed')
    )
  );

-- Tradies can view their own requests
CREATE POLICY "Tradies can view own date change requests"
  ON date_change_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

-- Clients can view requests for their projects
CREATE POLICY "Clients can view date change requests for own projects"
  ON date_change_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = date_change_requests.project_id
      AND projects.client_id = auth.uid()
    )
  );

-- Clients can update (approve/reject) requests for their projects
CREATE POLICY "Clients can respond to date change requests"
  ON date_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = date_change_requests.project_id
      AND projects.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = date_change_requests.project_id
      AND projects.client_id = auth.uid()
    )
  );

-- Notify client when a tradie requests a date change
CREATE OR REPLACE FUNCTION notify_client_on_date_change_request()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id uuid;
  v_project_title text;
  v_requester_name text;
  v_field_label text;
BEGIN
  SELECT p.client_id, p.title INTO v_client_id, v_project_title
  FROM projects p WHERE p.id = NEW.project_id;

  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = NEW.requester_id;

  v_field_label := CASE NEW.field_name
    WHEN 'start_date' THEN 'start date'
    WHEN 'estimated_end_date' THEN 'end date'
    ELSE NEW.field_name
  END;

  INSERT INTO notifications (user_id, type, title, message, reference_id)
  VALUES (
    v_client_id,
    'date_change_request',
    'Date Change Requested',
    COALESCE(v_requester_name, 'A tradie') || ' has requested to change the ' || v_field_label || ' for "' || v_project_title || '" to ' || to_char(NEW.requested_date, 'DD Mon YYYY') || '.',
    NEW.project_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_client_date_change_trigger ON date_change_requests;
CREATE TRIGGER notify_client_date_change_trigger
  AFTER INSERT ON date_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_client_on_date_change_request();

-- Notify tradie when their request is approved or rejected
CREATE OR REPLACE FUNCTION notify_tradie_on_date_change_response()
RETURNS TRIGGER AS $$
DECLARE
  v_project_title text;
  v_field_label text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    NEW.responded_at = now();

    SELECT title INTO v_project_title
    FROM projects WHERE id = NEW.project_id;

    v_field_label := CASE NEW.field_name
      WHEN 'start_date' THEN 'start date'
      WHEN 'estimated_end_date' THEN 'end date'
      ELSE NEW.field_name
    END;

    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      NEW.requester_id,
      'date_change_response',
      CASE NEW.status WHEN 'approved' THEN 'Date Change Approved' ELSE 'Date Change Declined' END,
      'Your request to change the ' || v_field_label || ' for "' || v_project_title || '" has been ' || NEW.status || '.',
      NEW.project_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_tradie_date_change_response_trigger ON date_change_requests;
CREATE TRIGGER notify_tradie_date_change_response_trigger
  BEFORE UPDATE ON date_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_tradie_on_date_change_response();