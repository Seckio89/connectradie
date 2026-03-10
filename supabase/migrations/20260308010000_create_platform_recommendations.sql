-- Platform recommendations table for admin insights engine
CREATE TABLE IF NOT EXISTS platform_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('growth', 'pricing', 'promotions', 'trends', 'operations')),
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'implemented', 'dismissed')),
  data_snapshot jsonb,
  action_url text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can view recommendations" ON platform_recommendations
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update recommendations" ON platform_recommendations
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert recommendations" ON platform_recommendations
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_recommendations_category ON platform_recommendations(category);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON platform_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_priority_created ON platform_recommendations(priority, created_at DESC);
