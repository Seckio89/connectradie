-- Recurring invoices for billing recurring service sessions
CREATE TABLE recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_job_id UUID REFERENCES recurring_jobs(id) ON DELETE CASCADE,
  homeowner_id UUID REFERENCES profiles(id),
  tradie_id UUID REFERENCES profiles(id),
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  regular_sessions_count INTEGER DEFAULT 0,
  extra_sessions_count INTEGER DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  extras_total DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  stripe_payment_intent_id TEXT,
  stripe_payment_url TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;

-- Homeowner can read their own invoices
CREATE POLICY "Homeowner can read own invoices"
  ON recurring_invoices FOR SELECT
  TO authenticated
  USING (homeowner_id = auth.uid());

-- Tradie can read invoices for their jobs
CREATE POLICY "Tradie can read own invoices"
  ON recurring_invoices FOR SELECT
  TO authenticated
  USING (tradie_id = auth.uid());

-- Service role only for insert/update (edge functions)
CREATE POLICY "Service role can insert invoices"
  ON recurring_invoices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update invoices"
  ON recurring_invoices FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for dashboard queries
CREATE INDEX idx_recurring_invoices_homeowner ON recurring_invoices(homeowner_id, created_at DESC);
CREATE INDEX idx_recurring_invoices_tradie ON recurring_invoices(tradie_id, created_at DESC);
CREATE INDEX idx_recurring_invoices_job ON recurring_invoices(recurring_job_id);
