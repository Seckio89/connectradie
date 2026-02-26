/*
  # Add reason category and photo support to job variations

  1. Modified Tables
    - `job_variations`
      - `reason_category` (text, nullable) - Quick-select reason: materials, scope_change, unforeseen, additional_labour, other
      - `photo_urls` (text[], default empty) - Supporting photo evidence URLs

  2. Notes
    - These fields enhance the progress payment request workflow
    - reason_category allows quick categorization without typing
    - photo_urls lets tradies attach evidence photos to justify requests
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_variations' AND column_name = 'reason_category'
  ) THEN
    ALTER TABLE job_variations ADD COLUMN reason_category text DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_variations' AND column_name = 'photo_urls'
  ) THEN
    ALTER TABLE job_variations ADD COLUMN photo_urls text[] DEFAULT '{}';
  END IF;
END $$;