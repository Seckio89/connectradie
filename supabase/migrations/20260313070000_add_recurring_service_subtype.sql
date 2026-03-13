-- Add service_subtype column to recurring_jobs for specific service types
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS service_subtype TEXT;
