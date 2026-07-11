-- ─────────────────────────────────────────────────────────────────────────────
-- Worker-side timesheet visibility. Previously time_entries was employer-only
-- (FOR ALL USING business_owner_id = auth.uid()), so a worker couldn't see their
-- own recorded hours. Add a READ-ONLY path for the worker — they still cannot
-- insert/update/approve (that stays with the employer's existing FOR ALL policy).
-- ─────────────────────────────────────────────────────────────────────────────

-- Data-layer capability: a worker can read rows where they are the member.
CREATE POLICY "Workers can view own time entries" ON time_entries
  FOR SELECT USING ((select auth.uid()) = team_member_id);

-- Enriched view for the "My Hours" tab: the worker's own entries plus the job
-- title and the employer's name. SECURITY DEFINER so the worker doesn't need RLS
-- on the employer's jobs; scoped strictly to the caller (team_member_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.get_my_time_entries(p_since date, p_until date)
RETURNS TABLE(
  id uuid,
  job_id uuid,
  job_title text,
  entry_date date,
  hours numeric,
  status text,
  source text,
  arrived_at timestamptz,
  departed_at timestamptz,
  employer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    te.id, te.job_id, j.title, te.date, te.hours, te.status, te.source,
    te.arrived_at, te.departed_at, owner.full_name
  FROM time_entries te
  LEFT JOIN jobs j ON j.id = te.job_id
  LEFT JOIN profiles owner ON owner.id = te.business_owner_id
  WHERE te.team_member_id = (select auth.uid())
    AND te.date >= p_since
    AND te.date <= p_until
  ORDER BY te.date DESC, te.arrived_at;
$$;
