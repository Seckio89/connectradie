/*
  # Add Comprehensive Job Booking Details

  This migration adds new fields to the jobs table to capture detailed project requirements
  when clients book services.

  1. New Columns Added to `jobs` Table
    - `contact_name` (text) - Name of contact person for the job
    - `contact_phone` (text) - Phone number for job-specific contact
    - `location_address` (text) - Full address for the job location
    - `budget_type` (text) - Type of budget: 'request_quote', 'fixed_budget', 'hourly_rate'
    - `budget_amount` (numeric) - Budget amount (nullable for quote requests)
    - `access_instructions` (text) - Instructions for accessing the property
    - `job_complexity` (text) - Complexity level: 'standard', 'emergency', 'complex'

  2. Notes
    - All new columns are nullable to maintain backwards compatibility
    - Existing jobs will continue to work without these fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE jobs ADD COLUMN contact_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE jobs ADD COLUMN contact_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'location_address'
  ) THEN
    ALTER TABLE jobs ADD COLUMN location_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'budget_type'
  ) THEN
    ALTER TABLE jobs ADD COLUMN budget_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'budget_amount'
  ) THEN
    ALTER TABLE jobs ADD COLUMN budget_amount numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'access_instructions'
  ) THEN
    ALTER TABLE jobs ADD COLUMN access_instructions text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'job_complexity'
  ) THEN
    ALTER TABLE jobs ADD COLUMN job_complexity text DEFAULT 'standard';
  END IF;
END $$;