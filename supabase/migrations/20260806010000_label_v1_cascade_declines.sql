-- Label competitive losses on the flow_version = 1 acceptance path.
--
-- When a client accepts a quote, every other pending quote on that job is
-- declined. On flow_version = 2 that cascade runs in the accept-and-pay edge
-- function, which stamps declined_at and decline_reason = 'cascade'. On
-- flow_version = 1 the cascade runs here, in the trigger, and set only
-- status = 'declined' -- so a competitive loss was indistinguishable from a
-- client's explicit decline, and the timestamp was never recorded.
--
-- That is the dependent variable for win-rate analysis, and flow_version = 1
-- is the majority of live jobs, so the gap covered most of the traffic.
--
-- The only change below is the two added columns in the cascade UPDATE. The
-- rest of the body is carried forward verbatim from the definition installed
-- by 20260223055321_create_quotes_system.sql. decline_reason is free text with
-- no CHECK constraint, and 'cascade' matches the literal the edge function
-- already writes, so both flows now produce one label.

CREATE OR REPLACE FUNCTION public.handle_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    NEW.accepted_at = now();

    UPDATE jobs
    SET tradie_id = NEW.tradie_id,
        status = 'accepted',
        quoting_status = 'awarded'
    WHERE id = NEW.job_id;

    UPDATE quotes
    SET status = 'declined',
        declined_at = now(),
        decline_reason = 'cascade',
        updated_at = now()
    WHERE job_id = NEW.job_id
      AND id != NEW.id
      AND status = 'pending';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- CREATE OR REPLACE preserves the existing ACL, but re-assert it so a rebuild
-- from migrations lands on the same grants as production.
REVOKE EXECUTE ON FUNCTION public.handle_quote_acceptance() FROM anon, authenticated, public;
