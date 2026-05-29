-- The recurring-service form (ClientServicesTab) sends a consumables_provider
-- choice ('client' = client keeps consumables stocked, 'tradie_billed' = tradie
-- buys and bills them) and createRecurringJob inserts it — but the column was
-- never added to recurring_jobs. PostgREST rejects the insert with an unknown
-- column, so "Schedule Recurring Service" failed silently (the jobs row was
-- created, the recurring_jobs row was not). Add the column.
ALTER TABLE public.recurring_jobs
  ADD COLUMN IF NOT EXISTS consumables_provider text NOT NULL DEFAULT 'client'
  CHECK (consumables_provider IN ('client', 'tradie_billed'));

COMMENT ON COLUMN public.recurring_jobs.consumables_provider IS
  'Who supplies household consumables: client (stocked at home) or tradie_billed (tradie buys, adds to invoice).';
