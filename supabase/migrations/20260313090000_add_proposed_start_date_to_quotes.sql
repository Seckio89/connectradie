-- Add proposed_start_date to quotes table
-- Tradies can propose their earliest available start date when quoting
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS proposed_start_date DATE;
