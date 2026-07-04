-- Richer job-posting fields for trade_vacancies so listings read as real trade
-- job ads (pay, employment type, tickets, hours, dates) and can be filtered /
-- surfaced on public pages. All additive and nullable/defaulted — safe for
-- existing rows.
ALTER TABLE trade_vacancies
  ADD COLUMN IF NOT EXISTS employment_type text
    CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time','casual','contract','apprenticeship')),
  ADD COLUMN IF NOT EXISTS pay_min numeric,
  ADD COLUMN IF NOT EXISTS pay_max numeric,
  ADD COLUMN IF NOT EXISTS pay_period text
    CHECK (pay_period IS NULL OR pay_period IN ('hour','day','week','year')),
  ADD COLUMN IF NOT EXISTS pay_note text,
  ADD COLUMN IF NOT EXISTS required_tickets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hours text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS closing_date date;
