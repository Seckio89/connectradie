-- Add final_price to quotes for post-site-visit price adjustments
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS final_price numeric;

-- Add adjustment tracking to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_amount integer;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS parent_payment_id uuid REFERENCES payments(id);
