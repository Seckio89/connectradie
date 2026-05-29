-- Flip a job onto the 3-stage flow (flow_version = 2) whenever a tradie submits
-- a quote that requires a site inspection. This was previously attempted from the
-- frontend in SubmitQuoteModal, but that UPDATE runs as the tradie and is silently
-- blocked by the jobs RLS UPDATE policy: on a pending job tradie_id is NULL, so the
-- tradie is neither client_id nor tradie_id, the USING clause matches 0 rows, and
-- the job stays on the legacy v1 deposit flow. Moving the flip into a SECURITY
-- DEFINER trigger makes it RLS-immune and reliable regardless of who submits.

CREATE OR REPLACE FUNCTION flip_job_to_three_stage_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_site_inspection IS TRUE THEN
    UPDATE jobs
    SET flow_version = 2
    WHERE id = NEW.job_id
      AND flow_version = 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flip_job_three_stage ON quotes;
CREATE TRIGGER trg_flip_job_three_stage
AFTER INSERT OR UPDATE OF requires_site_inspection ON quotes
FOR EACH ROW
EXECUTE FUNCTION flip_job_to_three_stage_flow();

-- Backfill: fix jobs that already have a site-inspection quote but were stranded
-- on v1 because the old frontend flip never took effect.
UPDATE jobs
SET flow_version = 2
WHERE flow_version = 1
  AND id IN (
    SELECT job_id FROM quotes WHERE requires_site_inspection IS TRUE
  );
