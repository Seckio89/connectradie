-- Tradie-set site-visit call-out fee (3-stage flow). The tradie sets a fee per
-- quote that requires a site inspection; the client pays it at booking (routed to
-- the tradie) and it's credited against the final price if they proceed. UI clamps
-- to $20-$100; DB stays lenient (0-$200) so the bounds can be tuned without a migration.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS call_out_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS site_visit_fee_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS site_visit_fee_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS site_visit_fee_status TEXT;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_call_out_fee_range_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_call_out_fee_range_check
  CHECK (call_out_fee_cents IS NULL OR (call_out_fee_cents >= 0 AND call_out_fee_cents <= 20000));

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_site_visit_fee_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_site_visit_fee_status_check
  CHECK (site_visit_fee_status IS NULL OR site_visit_fee_status IN ('paid', 'credited'));

-- Tradie's reusable default call-out fee (prefills the quote form).
ALTER TABLE tradie_details
  ADD COLUMN IF NOT EXISTS default_call_out_fee_cents INTEGER;
