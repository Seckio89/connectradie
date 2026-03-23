-- Add 'price_adjustment' to payments.payment_type CHECK constraint
-- Required for the pay-price-increase edge function to insert child payment records

-- Drop old constraint and re-create with the new value
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;

ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('lead_unlock', 'job_access', 'job_funding', 'job_payment', 'price_adjustment'));
