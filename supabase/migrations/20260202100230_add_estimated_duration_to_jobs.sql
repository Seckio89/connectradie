/*
  # Add estimated duration to jobs table
  
  1. Changes
    - Add `estimated_duration` column to jobs table to track ETA for completion
    - Supports values like "1 hour", "2 hours", "Half Day", "Full Day"
  
  2. Notes
    - Stored as text for flexibility (e.g., "2 hours", "Half Day")
    - Can be converted to interval type later if needed for calculations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'estimated_duration'
  ) THEN
    ALTER TABLE jobs ADD COLUMN estimated_duration text;
  END IF;
END $$;