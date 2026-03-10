CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  payments_checked integer NOT NULL DEFAULT 0,
  mismatches_found integer NOT NULL DEFAULT 0,
  mismatches_fixed integer NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_reconciliation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reconciliation logs" ON payment_reconciliation_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
