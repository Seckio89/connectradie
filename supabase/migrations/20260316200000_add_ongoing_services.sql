-- Ongoing Service mode: service agreements, visits, and invoices.
-- Supports flexible recurring client-tradie relationships with monthly invoicing.

-- ══════════════════════════════════════════════════════════
-- 1. service_agreements
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS service_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tradie_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Service details
  title TEXT NOT NULL,
  description TEXT,
  trade_category TEXT NOT NULL,

  -- Location
  address TEXT NOT NULL,
  suburb TEXT,
  state TEXT,
  postcode TEXT,

  -- Pricing
  rate_per_visit DECIMAL(10, 2) NOT NULL,
  rate_includes_gst BOOLEAN DEFAULT false,

  -- Schedule (flexible, not rigid)
  typical_frequency TEXT CHECK (typical_frequency IN (
    'daily', 'weekly', 'fortnightly', 'monthly', 'as_needed'
  )) DEFAULT 'weekly',
  typical_day TEXT,
  typical_time TEXT,
  notes TEXT,

  -- Billing
  billing_cycle TEXT CHECK (billing_cycle IN (
    'weekly', 'fortnightly', 'monthly', 'on_request'
  )) DEFAULT 'monthly',

  -- Status
  status TEXT CHECK (status IN ('active', 'paused', 'ended')) DEFAULT 'active',

  -- Origin
  original_job_id UUID REFERENCES jobs(id),
  original_quote_id UUID REFERENCES quotes(id),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreements_client ON service_agreements(client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agreements_tradie ON service_agreements(tradie_id) WHERE status = 'active';

ALTER TABLE service_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agreements"
  ON service_agreements FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = tradie_id);

CREATE POLICY "Tradies can create agreements"
  ON service_agreements FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = tradie_id);

CREATE POLICY "Parties can update their agreements"
  ON service_agreements FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = client_id OR (SELECT auth.uid()) = tradie_id);

-- ══════════════════════════════════════════════════════════
-- 2. service_visits
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agreement_id UUID NOT NULL REFERENCES service_agreements(id) ON DELETE CASCADE,

  visit_date DATE NOT NULL,
  visit_type TEXT CHECK (visit_type IN ('regular', 'extra', 'makeup', 'final')) DEFAULT 'regular',

  amount DECIMAL(10, 2) NOT NULL,
  amount_includes_gst BOOLEAN DEFAULT false,

  status TEXT CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')) DEFAULT 'scheduled',

  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),

  invoice_id UUID, -- FK added after service_invoices is created

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_agreement ON service_visits(agreement_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON service_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_uninvoiced ON service_visits(agreement_id)
  WHERE invoice_id IS NULL AND status = 'completed';

ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agreement parties can view visits"
  ON service_visits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
      AND (sa.client_id = (SELECT auth.uid()) OR sa.tradie_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Tradie can manage visits"
  ON service_visits FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
      AND sa.tradie_id = (SELECT auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════
-- 3. service_invoices
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS service_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agreement_id UUID NOT NULL REFERENCES service_agreements(id) ON DELETE CASCADE,

  invoice_number TEXT NOT NULL,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  subtotal DECIMAL(10, 2) NOT NULL,
  gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 0,

  status TEXT CHECK (status IN (
    'draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'
  )) DEFAULT 'draft',

  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,

  sent_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Now add FK from service_visits to service_invoices
ALTER TABLE service_visits
  ADD CONSTRAINT fk_visit_invoice
  FOREIGN KEY (invoice_id) REFERENCES service_invoices(id);

ALTER TABLE service_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agreement parties can view invoices"
  ON service_invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
      AND (sa.client_id = (SELECT auth.uid()) OR sa.tradie_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Tradie can manage invoices"
  ON service_invoices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
      AND sa.tradie_id = (SELECT auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════
-- 4. Auto-update updated_at triggers
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_service_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_agreements_updated_at
  BEFORE UPDATE ON service_agreements
  FOR EACH ROW EXECUTE FUNCTION update_service_updated_at();

CREATE TRIGGER trg_visits_updated_at
  BEFORE UPDATE ON service_visits
  FOR EACH ROW EXECUTE FUNCTION update_service_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION update_service_updated_at();
