-- Add title column to jobs table for client-facing job names
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title text;

-- Backfill existing jobs: extract category from description as title
UPDATE jobs SET title = regexp_replace(description, '^\[([^\]]+)\].*', '\1')
WHERE description ~ '^\[' AND title IS NULL;
