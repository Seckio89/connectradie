-- Add supplies tracking to recurring jobs and sessions
-- Supports: static supply list, per-visit cost logging, restock alerts

-- Supply list on the recurring job (persistent across visits)
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS supplies jsonb DEFAULT '[]'::jsonb;

-- Per-visit supply usage and cost
ALTER TABLE recurring_sessions
  ADD COLUMN IF NOT EXISTS supply_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplies_used jsonb DEFAULT '[]'::jsonb;

-- Comments for clarity
COMMENT ON COLUMN recurring_jobs.supplies IS 'Array of supply items: [{id, name, unit, provided_by, stock_level, restock_threshold, restock_notified_at, notes}]';
-- Supplies total on invoices for transparent breakdown
ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS supplies_total numeric DEFAULT 0;

COMMENT ON COLUMN recurring_sessions.supply_cost IS 'Total cost of supplies used/purchased for this visit (AUD)';
COMMENT ON COLUMN recurring_sessions.supplies_used IS 'Array of supplies consumed: [{supply_id, name, quantity_used, cost}]';
COMMENT ON COLUMN recurring_invoices.supplies_total IS 'Total supply costs included in this invoice (AUD)';
