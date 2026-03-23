-- Add invoice scheduling settings to recurring_jobs
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS auto_invoice BOOLEAN DEFAULT false;
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS invoice_send_day INTEGER DEFAULT 1;
  -- For monthly: day of month (1-28). For fortnightly: day of week (1=Mon, 7=Sun)
ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS invoice_send_time TIME DEFAULT '09:00:00';
