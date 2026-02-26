/*
  # Create Projects System for Job Coordination

  ## Overview
  This migration creates a projects system that allows clients to group multiple jobs together,
  enabling tradies to see the timeline of related jobs without exposing sensitive information.

  ## 1. New Tables
    - `projects`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key to auth.users)
      - `title` (text) - Project name like "Kitchen Renovation"
      - `description` (text, optional) - Project details
      - `start_date` (date) - Project start date
      - `estimated_end_date` (date) - Expected completion date
      - `status` (text) - 'active', 'completed', 'cancelled'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## 2. Modified Tables
    - `jobs`
      - Add `project_id` (uuid, optional foreign key to projects)

  ## 3. Security
    - Enable RLS on projects table
    - Clients can view and manage their own projects
    - Tradies can view projects for jobs they're assigned to

  ## 4. Functions
    - Trigger to update `updated_at` timestamp
    - Function to notify project tradies of timeline changes
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  start_date date,
  estimated_end_date date,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add project_id to jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster project job lookups
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Clients can view their own projects
CREATE POLICY "Clients can view own projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

-- Clients can create their own projects
CREATE POLICY "Clients can create own projects"
  ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = client_id);

-- Clients can update their own projects
CREATE POLICY "Clients can update own projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Clients can delete their own projects
CREATE POLICY "Clients can delete own projects"
  ON projects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = client_id);

-- Tradies can view projects for jobs they're assigned to
CREATE POLICY "Tradies can view assigned projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.project_id = projects.id
      AND jobs.tradie_id = auth.uid()
      AND jobs.status IN ('accepted', 'in_progress', 'completed')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

-- Function to notify project tradies when job dates change
CREATE OR REPLACE FUNCTION notify_project_tradies_on_job_change()
RETURNS TRIGGER AS $$
DECLARE
  v_project_title text;
  v_tradie_id uuid;
BEGIN
  -- Only proceed if the job is part of a project and dates changed
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if scheduled_date or is_delayed changed
  IF (OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date) OR 
     (OLD.is_delayed IS DISTINCT FROM NEW.is_delayed) THEN
    
    -- Get project title
    SELECT title INTO v_project_title
    FROM projects
    WHERE id = NEW.project_id;

    -- Notify all other tradies in the same project
    FOR v_tradie_id IN 
      SELECT DISTINCT tradie_id 
      FROM jobs 
      WHERE project_id = NEW.project_id 
      AND tradie_id != NEW.tradie_id
      AND tradie_id IS NOT NULL
      AND status IN ('accepted', 'in_progress')
    LOOP
      INSERT INTO notifications (user_id, type, title, message, reference_id)
      VALUES (
        v_tradie_id,
        'project_update',
        'Project Timeline Updated',
        'The timeline for "' || v_project_title || '" has changed. Please check the updated dates.',
        NEW.project_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to notify tradies on job changes
DROP TRIGGER IF EXISTS notify_project_tradies_trigger ON jobs;
CREATE TRIGGER notify_project_tradies_trigger
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_project_tradies_on_job_change();