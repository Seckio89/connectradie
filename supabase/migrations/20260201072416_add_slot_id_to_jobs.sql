/*
  # Add Availability Slot Link to Jobs

  1. Changes
    - Add `slot_id` column to `jobs` table
      - Links a job to a specific availability slot
      - Optional (nullable) for backward compatibility
      - Foreign key reference to availability_slots table
    
  2. Purpose
    - Connect booking requests to specific available time slots
    - Allow automatic booking of slots when jobs are accepted
    - Enable clients to select specific time slots when requesting bookings
*/

-- Add slot_id column to jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'slot_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN slot_id uuid REFERENCES availability_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_jobs_slot_id ON jobs(slot_id);
