-- Migration: create_tradie_cost_settings
-- Type: User-owned (tradie-owned) — two tables
-- Description: A tradie's private cost basis, and a per-quote snapshot of it.
--
-- WHY THIS IS ITS OWN TABLE, TWICE OVER:
--
--   1. NOT on tradie_details. That table is read by PublicTradieProfile, so a
--      wage, overhead figure or profit target stored there would be published
--      to the open web alongside the tradie's advertised hourly rate.
--
--   2. NOT on quotes. quotes carries a client-side SELECT policy ("Clients can
--      view quotes on their jobs"), and RLS is row-level — a client who can see
--      the row can read every column on it. A cost snapshot stored on quotes
--      would hand the client the tradie's margin %, materials markup and cost
--      floor, i.e. their entire negotiating position. quote_cost_snapshots is
--      keyed to the quote but gated on tradie_id, so only the tradie can read it.
--
-- Both tables are tradie-private by construction. Nothing server-side reads
-- them today: the margin check is computed client-side from these values and is
-- purely advisory — it never gates a quote and never touches the money path.

-- ============================================================
-- 1. TRADIE COST SETTINGS — one row per tradie
-- ============================================================
CREATE TABLE IF NOT EXISTS tradie_cost_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tradie_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Base hourly wage actually paid on the tools (the tradie's own drawing if
  -- solo). 0 means "not set" — the margin check stays switched off and no
  -- verdict is shown anywhere. It is never inferred and never defaulted to a
  -- statutory or award figure.
  staff_wage_cents integer NOT NULL DEFAULT 0
    CHECK (staff_wage_cents >= 0),

  -- On-costs as a % of wage: superannuation, workers' compensation, payroll
  -- tax, leave loading. The tradie sets this; it is NOT validated against any
  -- award or statutory rate, because those vary by classification, casual vs
  -- permanent and penalty rates, and asserting a floor here would be
  -- industrial-relations advice the platform is not placed to give.
  labour_burden_pct numeric(5,2) NOT NULL DEFAULT 30
    CHECK (labour_burden_pct >= 0 AND labour_burden_pct <= 200),

  -- Fixed costs to recover as a % of direct cost: insurance, vehicle,
  -- software, licensing, admin.
  overhead_recovery_pct numeric(5,2) NOT NULL DEFAULT 20
    CHECK (overhead_recovery_pct >= 0 AND overhead_recovery_pct <= 200),

  -- Owner pay + profit + growth, as a % of direct cost including overhead.
  profit_target_pct numeric(5,2) NOT NULL DEFAULT 20
    CHECK (profit_target_pct >= 0 AND profit_target_pct <= 200),

  -- Floor under the minimum viable price. 0 = no floor.
  minimum_job_value_cents integer NOT NULL DEFAULT 0
    CHECK (minimum_job_value_cents >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tradie_cost_settings IS
  'A tradie''s private cost basis (wage, burden, overhead, profit target, minimum job value) used to work out whether a quote clears the cost of delivering it. Tradie-readable only — never exposed to clients or on public profiles. The CHECK bounds are sanity limits, not policy: nothing here is enforced against award or statutory rates.';

-- The percentage bounds above are deliberately wide. They exist to keep the
-- arithmetic meaningful, not to constrain what a tradie may charge.

CREATE INDEX IF NOT EXISTS idx_tradie_cost_settings_tradie
  ON tradie_cost_settings(tradie_id);

ALTER TABLE tradie_cost_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tradie_cost_settings_select_own"
  ON tradie_cost_settings FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tradie_id);

CREATE POLICY "tradie_cost_settings_insert_own"
  ON tradie_cost_settings FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = tradie_id);

CREATE POLICY "tradie_cost_settings_update_own"
  ON tradie_cost_settings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tradie_id)
  WITH CHECK ((select auth.uid()) = tradie_id);

-- No DELETE policy: the row is disposable config with a UNIQUE tradie_id, so
-- it is upserted rather than replaced. Clearing the wage back to 0 switches the
-- feature off, which is the only "delete" a tradie needs.

CREATE OR REPLACE FUNCTION public.update_tradie_cost_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_tradie_cost_settings ON tradie_cost_settings;
CREATE TRIGGER set_updated_at_tradie_cost_settings
  BEFORE UPDATE ON tradie_cost_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tradie_cost_settings_updated_at();

-- ============================================================
-- 2. QUOTE COST SNAPSHOTS — what the numbers were when the quote went out
-- ============================================================
-- Today the estimator builds a full cost model, renders it, then collapses it
-- to a single integer on apply; nothing structured survives. This keeps the
-- basis so a quote can be reopened, re-priced and understood later.
CREATE TABLE IF NOT EXISTS quote_cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Denormalised so RLS can gate on the tradie without joining quotes.
  tradie_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Versioned snapshot: { v, hours, workers, hoursMode, hourlyRateCents,
  -- marginPct, materialsMarkupPct, materialsCostCents, minViableCents,
  -- cushionCents, status }. Read through a typed guard, never as `any`.
  --
  -- If per-job margin REPORTING is wanted later, promote min_viable_cents and
  -- cushion_cents to real columns — jsonb is right for a snapshot nothing
  -- queries, wrong for something you want to aggregate.
  basis jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
  -- No updated_at: a snapshot records what was true when the quote was sent.
);

COMMENT ON TABLE quote_cost_snapshots IS
  'Per-quote snapshot of the tradie''s cost basis and margin verdict at the moment the quote was sent. Tradie-readable only — deliberately NOT a column on quotes, which clients can read row-wise.';

CREATE INDEX IF NOT EXISTS idx_quote_cost_snapshots_tradie
  ON quote_cost_snapshots(tradie_id);

ALTER TABLE quote_cost_snapshots ENABLE ROW LEVEL SECURITY;

-- Only the tradie who wrote it. Clients get nothing, on any quote, ever.
CREATE POLICY "quote_cost_snapshots_select_own"
  ON quote_cost_snapshots FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = tradie_id);

-- The quote must genuinely be the inserting tradie's own — otherwise a tradie
-- could attach a snapshot to someone else's quote id.
CREATE POLICY "quote_cost_snapshots_insert_own"
  ON quote_cost_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = tradie_id
    AND EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_cost_snapshots.quote_id
        AND quotes.tradie_id = (select auth.uid())
    )
  );

CREATE POLICY "quote_cost_snapshots_update_own"
  ON quote_cost_snapshots FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = tradie_id)
  WITH CHECK ((select auth.uid()) = tradie_id);

-- No DELETE policy: snapshots follow their quote via ON DELETE CASCADE.
