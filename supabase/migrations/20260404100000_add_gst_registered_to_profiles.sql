-- Add GST registration flag to profiles
-- Tradies with turnover > $75K AUD must be GST-registered
-- When true, 10% GST is added to job amounts at checkout
-- When false, GST is only applied to ConnecTradie platform fees

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_gst_registered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_gst_registered IS 'Whether the tradie is registered for GST with the ATO';
