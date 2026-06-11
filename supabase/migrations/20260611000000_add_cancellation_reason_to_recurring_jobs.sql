-- Capture a structured reason whenever a recurring service is ended so the
-- other party gets context in their notification, and so we can analyse
-- why services churn over time (price / quality / frequency / lifestyle).
--
-- The reason itself is optional from the client's side — we never want to
-- gate a cancellation behind a required field — but when supplied it lives
-- here alongside cancelled_at + cancelled_by_role.
--
-- category is a short enum-like string (price / not_needed / quality /
-- changed_tradie / frequency / other). reason is the free-text follow-up.

ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_category text;

COMMENT ON COLUMN recurring_jobs.cancellation_reason IS 'Free-text reason supplied when the service was ended (optional).';
COMMENT ON COLUMN recurring_jobs.cancellation_reason_category IS 'Short category for the cancellation: price | not_needed | quality | changed_tradie | frequency | other.';
