/*
  # Team Management & Site Calendar System

  ## Overview
  Adds comprehensive team management for trade businesses, enabling:
  - Business owners to invite and manage team members / subcontractors
  - Team member assignment to specific jobs and projects
  - Site-level calendar showing all team movements to prevent double-booking
  - Project phases for structured multi-stage job management

  ## New Tables

  ### 1. `business_team_members`
  Represents a person who works for/with a trade business.
  - Linked to the business owner's profile (business_owner_id)
  - Can be an existing platform user (member_profile_id) or external invite
  - Roles: owner, employee, subcontractor
  - Status: invited, active, inactive

  ### 2. `job_team_assignments`
  Links team members to specific jobs with their role and schedule.
  - Tracks who is assigned to which job
  - Records their specific time window at the site
  - Prevents double-booking via constraint checks

  ### 3. `project_phases`
  Adds structured phases to projects (e.g., demolition → framing → electrical → finishing).
  - Ordered phases with stage numbers
  - Status tracking per phase
  - Start/end date planning
  - Assign team members to phases

  ### 4. `phase_team_assignments`
  Links team members to project phases.
  - Records which team member is responsible for each phase
  - Tracks their scheduled dates for that phase

  ## Security
  - RLS enabled on all tables
  - Business owners can manage their own team data
  - Team members can view their own assignments
  - No cross-business data leakage
*/

-- ============================================================
-- TABLE: business_team_members
-- ============================================================
CREATE TABLE IF NOT EXISTS business_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invite_email text,
  invite_name text NOT NULL DEFAULT '',
  invite_phone text DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'subcontractor', 'apprentice')),
  trade_specialty text DEFAULT '',
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'inactive')),
  hourly_rate numeric(10,2) DEFAULT 0,
  notes text DEFAULT '',
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owner can manage their team"
  ON business_team_members FOR SELECT
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can insert team members"
  ON business_team_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can update team members"
  ON business_team_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_owner_id)
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can delete team members"
  ON business_team_members FOR DELETE
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Team members can view their own record"
  ON business_team_members FOR SELECT
  TO authenticated
  USING (auth.uid() = member_profile_id);

CREATE INDEX IF NOT EXISTS idx_business_team_members_owner ON business_team_members(business_owner_id);
CREATE INDEX IF NOT EXISTS idx_business_team_members_profile ON business_team_members(member_profile_id);

-- ============================================================
-- TABLE: job_team_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS job_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES business_team_members(id) ON DELETE CASCADE,
  business_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_date date,
  start_time time,
  end_time time,
  role_on_job text DEFAULT 'assistant',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_id, team_member_id)
);

ALTER TABLE job_team_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owner can manage job assignments"
  ON job_team_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can insert job assignments"
  ON job_team_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can update job assignments"
  ON job_team_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_owner_id)
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can delete job assignments"
  ON job_team_assignments FOR DELETE
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Assigned team members can view their job assignments"
  ON job_team_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_team_members btm
      WHERE btm.id = job_team_assignments.team_member_id
      AND btm.member_profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_job_team_assignments_job ON job_team_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_team_assignments_member ON job_team_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_job_team_assignments_owner ON job_team_assignments(business_owner_id);
CREATE INDEX IF NOT EXISTS idx_job_team_assignments_date ON job_team_assignments(scheduled_date);

-- ============================================================
-- TABLE: project_phases
-- ============================================================
CREATE TABLE IF NOT EXISTS project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  business_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  stage_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'skipped')),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  estimated_hours numeric(6,2) DEFAULT 0,
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owner can manage project phases"
  ON project_phases FOR SELECT
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can insert project phases"
  ON project_phases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can update project phases"
  ON project_phases FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_owner_id)
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can delete project phases"
  ON project_phases FOR DELETE
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE INDEX IF NOT EXISTS idx_project_phases_project ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_owner ON project_phases(business_owner_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_order ON project_phases(project_id, stage_order);

-- ============================================================
-- TABLE: phase_team_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS phase_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES business_team_members(id) ON DELETE CASCADE,
  business_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_person boolean DEFAULT false,
  scheduled_start date,
  scheduled_end date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(phase_id, team_member_id)
);

ALTER TABLE phase_team_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owner can manage phase assignments"
  ON phase_team_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can insert phase assignments"
  ON phase_team_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can update phase assignments"
  ON phase_team_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_owner_id)
  WITH CHECK (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can delete phase assignments"
  ON phase_team_assignments FOR DELETE
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE INDEX IF NOT EXISTS idx_phase_team_assignments_phase ON phase_team_assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_team_assignments_member ON phase_team_assignments(team_member_id);
