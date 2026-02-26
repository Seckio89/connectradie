/*
  # Add Missing FK Index on date_change_requests.project_id

  The foreign key date_change_requests_project_id_fkey on public.date_change_requests
  was missing a covering index, causing full table scans on JOIN/lookup operations.

  ## Changes
  - ADD: index on date_change_requests(project_id)
*/

CREATE INDEX IF NOT EXISTS idx_date_change_requests_project_id_fk
  ON public.date_change_requests(project_id);
