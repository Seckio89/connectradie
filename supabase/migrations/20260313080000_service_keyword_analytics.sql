-- ---------------------------------------------------------------------------
-- Service Description Keyword Analytics
-- Captures raw descriptions submitted by clients and aggregates keyword
-- frequency per service type so the UI can suggest popular keywords.
-- ---------------------------------------------------------------------------

-- 1. Raw descriptions — one row per recurring job creation
CREATE TABLE IF NOT EXISTS service_description_raw (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type  text NOT NULL,            -- e.g. 'Regular Domestic Clean'
  trade_category text NOT NULL,           -- e.g. 'Cleaning'
  description   text NOT NULL,
  client_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Keyword frequency — aggregated by the edge function
CREATE TABLE IF NOT EXISTS service_description_keywords (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type  text NOT NULL,            -- e.g. 'Regular Domestic Clean'
  keyword       text NOT NULL,
  frequency     integer NOT NULL DEFAULT 1,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_type, keyword)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sdr_service_type ON service_description_raw(service_type);
CREATE INDEX IF NOT EXISTS idx_sdr_trade_category ON service_description_raw(trade_category);
CREATE INDEX IF NOT EXISTS idx_sdk_service_type ON service_description_keywords(service_type);
CREATE INDEX IF NOT EXISTS idx_sdk_frequency ON service_description_keywords(frequency DESC);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE service_description_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_description_keywords ENABLE ROW LEVEL SECURITY;

-- Raw descriptions: clients can insert their own, nobody reads directly (edge function uses service role)
CREATE POLICY "Clients can insert own descriptions"
  ON service_description_raw FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid());

-- Keywords: anyone authenticated can read (for suggestions), only service role writes
CREATE POLICY "Authenticated users can read keywords"
  ON service_description_keywords FOR SELECT
  TO authenticated
  USING (true);
