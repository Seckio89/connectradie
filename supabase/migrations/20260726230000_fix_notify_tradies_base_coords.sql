-- Migration: fix_notify_tradies_base_coords
-- Description:
--   🔴 PRODUCTION FIX. Job posting was completely broken.
--
--   20260726150000_drop_moved_profile_columns.sql dropped
--   profiles.base_latitude / base_longitude / push_subscription after moving
--   them to profile_private. Application code (src/ and the edge functions) was
--   swept for references. DATABASE FUNCTIONS WERE NOT.
--
--   notify_tradies_on_new_job() is a trigger on jobs INSERT and still selected
--   p.base_latitude / p.base_longitude from profiles, so EVERY job insert
--   failed with:
--       42703: column p.base_latitude does not exist
--   i.e. nobody could post a job. Found by accident while probing something
--   unrelated — nothing was monitoring for it.
--
--   Postgres does not refuse a column drop over a function body that references
--   it, because function bodies are not dependency-tracked. A column drop
--   therefore needs a sweep of pg_proc.prosrc and information_schema.views, not
--   just application code. That sweep found exactly one casualty (this one);
--   filter_tradies_by_service_area and sync_has_push_subscription already read
--   profile_private, and no view references the dropped columns.
--
--   Both loops are repointed at profile_private via LEFT JOIN. LEFT, not inner:
--   the existing logic deliberately fails OPEN when coordinates are missing, so
--   a tradie with no profile_private row must still receive leads. An inner join
--   would silently stop notifying them.
--
--   Verified in a rolled-back transaction: job insert succeeds; a Granville job
--   notifies the nearby tradie; a Perth job notifies 0; a job with no
--   coordinates still notifies (fail-open intact).

CREATE OR REPLACE FUNCTION public.notify_tradies_on_new_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
  v_suburb text;
  v_tradie record;
  v_found_match boolean := false;
  v_notif_title text;
  v_notif_message text;
  v_desc_clean text;
BEGIN
  v_category := substring(NEW.description from '^\[([^\]]+)\]');

  IF NEW.location_address IS NOT NULL THEN
    v_suburb := trim(split_part(NEW.location_address, ',',
      greatest(1, array_length(string_to_array(NEW.location_address, ','), 1) - 1)
    ));
  ELSE
    v_suburb := 'your area';
  END IF;

  IF v_category IS NULL THEN
    v_category := 'General';
  END IF;

  IF NEW.title IS NOT NULL AND NEW.title != '' THEN
    v_notif_title := initcap(NEW.title) || ' in ' || v_suburb;
  ELSE
    v_notif_title := v_category || ' job in ' || v_suburb;
  END IF;

  v_desc_clean := regexp_replace(NEW.description, '^\[[^\]]+\]\s*', '');
  IF length(v_desc_clean) > 80 THEN
    v_desc_clean := left(v_desc_clean, 77) || '...';
  END IF;
  v_notif_message := v_desc_clean || ' — Quote now!';

  SELECT EXISTS (
    SELECT 1 FROM tradie_details
    WHERE lower(trade_category) = lower(v_category)
      AND profile_id != NEW.client_id
  ) INTO v_found_match;

  FOR v_tradie IN
    SELECT td.profile_id
    FROM tradie_details td
    JOIN profiles p ON p.id = td.profile_id
    LEFT JOIN profile_private pp ON pp.profile_id = td.profile_id
    WHERE lower(td.trade_category) = lower(v_category)
      AND td.profile_id != NEW.client_id
      AND (
        NEW.latitude IS NULL OR NEW.longitude IS NULL
        OR pp.base_latitude IS NULL OR pp.base_longitude IS NULL
        OR haversine_km(NEW.latitude, NEW.longitude, pp.base_latitude, pp.base_longitude)
             <= COALESCE(p.service_radius_km, 20)
      )
  LOOP
    INSERT INTO notifications (user_id, title, message, type, read, channel, notification_type, metadata, link, job_id)
    VALUES (
      v_tradie.profile_id, v_notif_title, v_notif_message, 'new_lead', false, 'in_app', 'NEW_LEAD',
      jsonb_build_object('category', v_category, 'suburb', v_suburb, 'job_id', NEW.id), '/work', NEW.id
    );
  END LOOP;

  IF NOT v_found_match THEN
    FOR v_tradie IN
      SELECT p.id
      FROM profiles p
      LEFT JOIN profile_private pp ON pp.profile_id = p.id
      WHERE p.role = 'tradie'
        AND p.id != NEW.client_id
        AND (
          NEW.latitude IS NULL OR NEW.longitude IS NULL
          OR pp.base_latitude IS NULL OR pp.base_longitude IS NULL
          OR haversine_km(NEW.latitude, NEW.longitude, pp.base_latitude, pp.base_longitude)
               <= COALESCE(p.service_radius_km, 20)
        )
    LOOP
      INSERT INTO notifications (user_id, title, message, type, read, channel, notification_type, metadata, link, job_id)
      VALUES (
        v_tradie.id, v_notif_title, v_notif_message, 'new_lead', false, 'in_app', 'NEW_LEAD',
        jsonb_build_object('category', v_category, 'suburb', v_suburb, 'job_id', NEW.id), '/work', NEW.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
