/*
  # Fix: new-quote notification must skip off-app-client jobs

  The on_new_quote_insert trigger inserts a notification for the job's client_id.
  Off-app-client jobs (client_contact_id set, client_id NULL) have no platform
  client, so the notification insert violated notifications.user_id NOT NULL and
  rolled back the whole quote insert. Guard: return early when client_id is NULL.
*/

CREATE OR REPLACE FUNCTION public.notify_client_new_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_title text;
  v_job_description text;
  v_client_id uuid;
  v_display_name text;
BEGIN
  SELECT title, description, client_id INTO v_job_title, v_job_description, v_client_id
  FROM jobs WHERE id = NEW.job_id;

  -- Off-app-client quotes have no platform client to notify.
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

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
$function$;
