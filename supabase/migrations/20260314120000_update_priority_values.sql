-- Update priority check constraint to use new values: low, normal, high
-- Migrate existing data: standard → normal, urgent → high

-- Drop old constraint
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_priority_check;

-- Migrate existing values
UPDATE jobs SET priority = 'normal' WHERE priority = 'standard';
UPDATE jobs SET priority = 'high' WHERE priority = 'urgent';

-- Add new constraint
ALTER TABLE jobs ADD CONSTRAINT jobs_priority_check
  CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]));

-- Update default
ALTER TABLE jobs ALTER COLUMN priority SET DEFAULT 'normal';
