-- Migration: comment_job_team_assignment_notes_exposure
-- Description: Documentation only — no schema or policy change.
--
-- 20260728205242 widened job_team_assignments' SELECT policy to include the job's
-- client, which the Workforce brief explicitly required ("visible to the owning
-- business, the worker, and the job's client"). RLS cannot filter columns, so that
-- necessarily exposes EVERY column of the row to the homeowner — including `notes`,
-- which is free text.
--
-- This is safe today: the only writer is src/pages/Jobs.tsx, which hardcodes
-- notes: '', so every live row is empty. The risk is entirely future-tense — the
-- first feature to put internal crew notes here (pay arrangements, subbie rates,
-- "don't send Dave, the client complained") would disclose them to that client
-- with no signal at the call site. A column comment is where the author of that
-- feature will actually see the warning.

COMMENT ON COLUMN public.job_team_assignments.notes IS
  'CLIENT-READABLE. The SELECT policy job_team_assignments_select_business_worker_or_client exposes this row to the job''s client, and RLS cannot filter columns. Do NOT store internal crew notes here (pay arrangements, subcontractor rates, performance remarks) — the homeowner can read them. Put owner-only text in a separate table. Empty on every row as at 2026-07-29.';
