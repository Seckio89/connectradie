-- Completes exact-time scheduling: jobs.start_time (added previously) plus an
-- end time, so a job can be placed as a real block on the calendar (e.g. 8:00 AM
-- – 10:00 AM) for both the client and the assigned tradie. The booking form
-- computes end_time from a start time + an estimated-duration preset.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN public.jobs.end_time IS
  'Optional estimated finish time (HH:MM), computed from start_time + duration. Null = open-ended / slot-based.';
