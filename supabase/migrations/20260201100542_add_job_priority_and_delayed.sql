/*
  # Add Job Priority and Delayed Status

  1. Changes
    - Add `priority` column to jobs table (normal, high, urgent)
    - Add `is_delayed` column to jobs table
    - Add `delayed_until` column for rescheduling
    - Add `notes` column for internal notes

  2. Security
    - Maintain existing RLS policies
    - Only tradies and clients can update their own jobs
*/

DO $$
BEGIN
  -- Add priority column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'priority'
  ) THEN
    ALTER TABLE jobs ADD COLUMN priority text CHECK (priority IN ('normal', 'high', 'urgent')) DEFAULT 'normal';
  END IF;

  -- Add is_delayed column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'is_delayed'
  ) THEN
    ALTER TABLE jobs ADD COLUMN is_delayed boolean DEFAULT false;
  END IF;

  -- Add delayed_until column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'delayed_until'
  ) THEN
    ALTER TABLE jobs ADD COLUMN delayed_until timestamptz;
  END IF;

  -- Add notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'notes'
  ) THEN
    ALTER TABLE jobs ADD COLUMN notes text;
  END IF;
END $$;
