/*
  # Flash Lead / Flash Boost System

  1. Modified Tables
    - `jobs`
      - `is_flash_boost` (boolean, default false) - whether job has reduced service fee incentive
      - `flash_expiry` (timestamptz, nullable) - when the flash boost expires

  2. Important Notes
    - Flash boosted jobs offer reduced service fees (5% instead of 10%) to incentivize tradies
    - Boost expires after the flash_expiry timestamp passes
    - Jobs are eligible for boosting when pending for more than 2 hours
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'is_flash_boost'
  ) THEN
    ALTER TABLE jobs ADD COLUMN is_flash_boost boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'flash_expiry'
  ) THEN
    ALTER TABLE jobs ADD COLUMN flash_expiry timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_flash_boost ON jobs(is_flash_boost) WHERE is_flash_boost = true;
