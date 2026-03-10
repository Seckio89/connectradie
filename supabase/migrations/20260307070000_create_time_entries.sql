CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL,
  business_owner_id uuid NOT NULL REFERENCES profiles(id),
  job_id uuid REFERENCES jobs(id),
  date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners can manage time entries" ON time_entries
  FOR ALL USING (auth.uid() = business_owner_id);

CREATE INDEX idx_time_entries_owner ON time_entries(business_owner_id);
CREATE INDEX idx_time_entries_member ON time_entries(team_member_id);
CREATE INDEX idx_time_entries_date ON time_entries(date DESC);
