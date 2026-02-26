/*
  # Add Project Status Agreement Tracking

  ## Overview
  This migration adds fields to track project status from both client and tradie perspectives,
  ensuring status changes only take effect when both parties agree.

  ## Changes
  1. New Columns in `projects` table:
    - `client_status` (text) - Client's view of the project status
    - `tradie_status` (text) - Tradie's view of the project status
    - `status_agreed` (boolean) - Whether both parties agree on the current status
    - `client_status_updated_at` (timestamptz) - When client last updated their status
    - `tradie_status_updated_at` (timestamptz) - When tradie last updated their status

  ## 2. Functions
    - Function to check if both parties agree and update the main status field
    - Trigger to automatically sync status when agreement is reached

  ## 3. Security
    - Update RLS policies to allow tradies to update their status perspective
*/

-- Add new status tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client_status'
  ) THEN
    ALTER TABLE projects ADD COLUMN client_status text DEFAULT 'active' CHECK (client_status IN ('active', 'completed', 'cancelled', 'ongoing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'tradie_status'
  ) THEN
    ALTER TABLE projects ADD COLUMN tradie_status text DEFAULT 'active' CHECK (tradie_status IN ('active', 'completed', 'cancelled', 'ongoing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status_agreed'
  ) THEN
    ALTER TABLE projects ADD COLUMN status_agreed boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client_status_updated_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN client_status_updated_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'tradie_status_updated_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN tradie_status_updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Initialize existing projects with current status
UPDATE projects
SET 
  client_status = status,
  tradie_status = status,
  status_agreed = true,
  client_status_updated_at = updated_at,
  tradie_status_updated_at = updated_at
WHERE client_status IS NULL OR tradie_status IS NULL;

-- Function to sync project status when both parties agree
CREATE OR REPLACE FUNCTION sync_project_status_on_agreement()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if both parties now agree on the status
  IF NEW.client_status = NEW.tradie_status THEN
    NEW.status = NEW.client_status;
    NEW.status_agreed = true;
  ELSE
    NEW.status_agreed = false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-sync status when agreement is reached
DROP TRIGGER IF EXISTS sync_project_status_trigger ON projects;
CREATE TRIGGER sync_project_status_trigger
  BEFORE UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.client_status IS DISTINCT FROM NEW.client_status OR OLD.tradie_status IS DISTINCT FROM NEW.tradie_status)
  EXECUTE FUNCTION sync_project_status_on_agreement();

-- Allow tradies to update their status perspective for projects they're assigned to
CREATE POLICY "Tradies can update status for assigned projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.project_id = projects.id
      AND jobs.tradie_id = auth.uid()
      AND jobs.status IN ('accepted', 'in_progress', 'completed')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.project_id = projects.id
      AND jobs.tradie_id = auth.uid()
      AND jobs.status IN ('accepted', 'in_progress', 'completed')
    )
  );

-- Function to notify the other party when status changes
CREATE OR REPLACE FUNCTION notify_on_project_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id uuid;
  v_tradie_id uuid;
  v_notified_user uuid;
  v_updater_role text;
BEGIN
  -- Get client and tradie IDs
  v_client_id := NEW.client_id;
  
  SELECT DISTINCT tradie_id INTO v_tradie_id
  FROM jobs
  WHERE project_id = NEW.id
  AND status IN ('accepted', 'in_progress', 'completed')
  LIMIT 1;

  -- Determine who made the change and who should be notified
  IF auth.uid() = v_client_id THEN
    v_notified_user := v_tradie_id;
    v_updater_role := 'Client';
  ELSE
    v_notified_user := v_client_id;
    v_updater_role := 'Tradie';
  END IF;

  -- Only notify if there's a disagreement
  IF NOT NEW.status_agreed AND v_notified_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      v_notified_user,
      'project_status_change',
      'Project Status Update Requested',
      v_updater_role || ' has updated their status for "' || NEW.title || '". Please review and update your status.',
      NEW.id
    );
  END IF;

  -- Notify both parties when agreement is reached
  IF NEW.status_agreed AND NOT OLD.status_agreed THEN
    -- Notify client
    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      v_client_id,
      'project_status_agreed',
      'Project Status Agreed',
      'Both parties have agreed on the status for "' || NEW.title || '".',
      NEW.id
    );
    
    -- Notify tradie
    IF v_tradie_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, reference_id)
      VALUES (
        v_tradie_id,
        'project_status_agreed',
        'Project Status Agreed',
        'Both parties have agreed on the status for "' || NEW.title || '".',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to notify on status changes
DROP TRIGGER IF EXISTS notify_project_status_change_trigger ON projects;
CREATE TRIGGER notify_project_status_change_trigger
  AFTER UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.client_status IS DISTINCT FROM NEW.client_status OR OLD.tradie_status IS DISTINCT FROM NEW.tradie_status OR OLD.status_agreed IS DISTINCT FROM NEW.status_agreed)
  EXECUTE FUNCTION notify_on_project_status_change();