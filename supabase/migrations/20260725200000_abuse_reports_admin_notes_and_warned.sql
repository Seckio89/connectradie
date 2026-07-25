-- Migration: abuse_reports_admin_notes_and_warned
-- Type: Bug fix — admin moderation is completely broken
--
-- `AdminModeration.tsx` ships a finished moderation UI: a notes textarea and
-- three buttons (Resolve / Issue Warning / Dismiss). Every one of them fails:
--
--   1. handleReportAction writes `admin_notes`, a column that does not exist on
--      abuse_reports (it exists only on `disputes`). PostgREST rejects the whole
--      UPDATE with 400 PGRST204.
--   2. The "Issue Warning" button writes status 'warned', which the CHECK
--      constraint forbids — so even with (1) fixed it would raise 23514.
--
-- The result is `showToast('Failed to update report', true)` on every action, so
-- no abuse report can be actioned at all.
--
-- Notably TypeScript could NOT catch this: `.update()` object literals are not
-- column-checked against the generated types the way `.select()` is. It was found
-- by reading the code against the live schema.
--
-- Adding the column and widening the constraint (rather than stripping the
-- feature) because the UI for both is already built and shipped.

alter table public.abuse_reports
  add column if not exists admin_notes text;

comment on column public.abuse_reports.admin_notes is
  'Moderator''s note recorded when actioning the report. Written by AdminModeration.';

-- 'warned' is a real moderation outcome distinct from resolved/dismissed: the
-- report was upheld and the user warned, without closing it as fully resolved.
alter table public.abuse_reports
  drop constraint if exists abuse_reports_status_check;

alter table public.abuse_reports
  add constraint abuse_reports_status_check
  check (status in ('pending', 'investigating', 'resolved', 'dismissed', 'warned'));
