/*
  # Add Emergency Job Field

  1. New Column
    - `is_emergency` (boolean) - Indicates if this is an emergency request
  
  2. Changes
    - Add new column to `jobs` table with default value false
*/

DO $$
BEGIN
  -- Add is_emergency column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'is_emergency'
  ) THEN
    ALTER TABLE jobs ADD COLUMN is_emergency boolean DEFAULT false;
  END IF;
END $$;
