-- Time-confirmation handshake for scheduled jobs.
--
-- A client's start_time/end_time is a *proposal* (they often can't know how long a
-- job really takes). The assigned tradie — the expert on duration — confirms or
-- adjusts the actual window after accepting. time_confirmed distinguishes the two:
--   false = client-proposed (or unset), awaiting the tradie
--   true  = the assigned tradie has confirmed the window
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS time_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.time_confirmed IS
  'Whether the assigned tradie has confirmed the start_time/end_time window. '
  'false = client proposal awaiting tradie confirmation.';
