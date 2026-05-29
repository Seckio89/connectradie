-- Exact-time scheduling + persistent conflict dismissals for the Site Calendar.
--
-- 1) jobs.start_time: the jobs table only had scheduled_date + preferred_time_slot
--    (coarse Morning/Midday/Afternoon). The reschedule flow now lets a client set an
--    exact clock time, which needs a real column to land in.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS start_time time;

COMMENT ON COLUMN public.jobs.start_time IS
  'Optional exact start time for the visit (HH:MM). Null = use preferred_time_slot.';

-- 2) conflict_dismissals: when a client clicks "Ignore" on a scheduling conflict,
--    persist it so the same conflict pair does not nag again on reload. pair_key is
--    the two job ids sorted and joined with "|", so it is order-independent.
CREATE TABLE IF NOT EXISTS public.conflict_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pair_key)
);

ALTER TABLE public.conflict_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conflict dismissals"
  ON public.conflict_dismissals FOR ALL
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
