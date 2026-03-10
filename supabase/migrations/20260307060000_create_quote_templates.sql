-- Quote templates for tradies to save and reuse common quote messages
CREATE TABLE IF NOT EXISTS quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  message text NOT NULL,
  default_duration text,
  includes_materials boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_quote_templates_tradie ON quote_templates(tradie_id);

ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quote templates"
  ON quote_templates FOR ALL
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);
