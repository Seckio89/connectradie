-- Fix the quote notification trigger to use job title instead of raw description.
-- Previously it showed "[cleaner] Mop floors..." instead of "Deep House Clean".

CREATE OR REPLACE FUNCTION public.notify_client_new_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_title text;
  v_job_description text;
  v_client_id uuid;
  v_tradie_name text;
  v_display_name text;
BEGIN
  SELECT title, description, client_id INTO v_job_title, v_job_description, v_client_id
  FROM jobs WHERE id = NEW.job_id;

  SELECT full_name INTO v_tradie_name
  FROM profiles WHERE id = NEW.tradie_id;

  -- Prefer the job title; fall back to first 80 chars of description
  v_display_name := COALESCE(NULLIF(TRIM(v_job_title), ''), LEFT(v_job_description, 80));

  INSERT INTO notifications (user_id, title, message, type, channel, metadata, job_id)
  VALUES (
    v_client_id,
    'New Quote Received',
    'A tradie has submitted a quote on your job: ' || v_display_name,
    'new_quote',
    'in_app',
    jsonb_build_object('job_id', NEW.job_id, 'quote_id', NEW.id),
    NEW.job_id
  );

  RETURN NEW;
END;
$$;
