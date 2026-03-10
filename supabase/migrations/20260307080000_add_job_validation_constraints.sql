-- Validate job postings have required fields
-- Safe to re-run: uses DO blocks with exception handling

DO $$
BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_description_not_empty CHECK (length(trim(description)) > 10);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_budget_positive CHECK (budget_amount IS NULL OR budget_amount > 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_max_quotes_range CHECK (max_quotes >= 1 AND max_quotes <= 20);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_status_valid CHECK (status IN ('pending', 'open', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
