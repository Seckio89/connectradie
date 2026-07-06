/*
  # Geo-scope new-job notifications by tradie service area

  1. New Function
    - `haversine_km(lat1, lng1, lat2, lng2)` — great-circle distance in km,
      IMMUTABLE, with the acos argument clamped to [-1, 1] to avoid float
      domain errors.

  2. Modified Function
    - `notify_tradies_on_new_job()` — now only notifies a tradie when the job
      sits within that tradie's `service_radius_km` of their base coordinates.
      FAILS OPEN: if the job has no coordinates, or a tradie has no base
      coordinates, the tradie is still notified (never suppress on missing data).
      The category-match vs all-tradies fallback semantics are unchanged — the
      fallback still fires only when the job's trade category has no tradies at
      all; geo-scoping only narrows WHO inside each branch gets notified.

  3. Notes
    - base_latitude/base_longitude live on `profiles`; the category branch joins
      profiles to read them (tradie_details has no coordinates).
*/

CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * acos(
    least(1, greatest(-1,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

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
  -- Extract category from description like "[Cleaner] ..."
  v_category := substring(NEW.description from '^\[([^\]]+)\]');

  -- Extract suburb from location_address (second-to-last comma part)
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

  -- Build notification title: use job title + suburb
  IF NEW.title IS NOT NULL AND NEW.title != '' THEN
    v_notif_title := initcap(NEW.title) || ' in ' || v_suburb;
  ELSE
    v_notif_title := v_category || ' job in ' || v_suburb;
  END IF;

  -- Build message: strip [Category] prefix from description, truncate
  v_desc_clean := regexp_replace(NEW.description, '^\[[^\]]+\]\s*', '');
  IF length(v_desc_clean) > 80 THEN
    v_desc_clean := left(v_desc_clean, 77) || '...';
  END IF;
  v_notif_message := v_desc_clean || ' — Quote now!';

  -- Does this trade category have ANY tradie at all? (drives fallback,
  -- independent of distance so we don't broaden the net just because the
  -- nearest matching tradie happens to be out of range.)
  SELECT EXISTS (
    SELECT 1 FROM tradie_details
    WHERE lower(trade_category) = lower(v_category)
      AND profile_id != NEW.client_id
  ) INTO v_found_match;

  -- Notify category-matched tradies whose service area covers the job.
  FOR v_tradie IN
    SELECT td.profile_id
    FROM tradie_details td
    JOIN profiles p ON p.id = td.profile_id
    WHERE lower(td.trade_category) = lower(v_category)
      AND td.profile_id != NEW.client_id
      AND (
        NEW.latitude IS NULL OR NEW.longitude IS NULL
        OR p.base_latitude IS NULL OR p.base_longitude IS NULL
        OR haversine_km(NEW.latitude, NEW.longitude, p.base_latitude, p.base_longitude)
             <= COALESCE(p.service_radius_km, 20)
      )
  LOOP
    INSERT INTO notifications (user_id, title, message, type, read, channel, notification_type, metadata, link, job_id)
    VALUES (
      v_tradie.profile_id, v_notif_title, v_notif_message, 'new_lead', false, 'in_app', 'NEW_LEAD',
      jsonb_build_object('category', v_category, 'suburb', v_suburb, 'job_id', NEW.id), '/work', NEW.id
    );
  END LOOP;

  -- Fallback: if the category has no tradies at all, notify every tradie whose
  -- service area covers the job.
  IF NOT v_found_match THEN
    FOR v_tradie IN
      SELECT p.id
      FROM profiles p
      WHERE p.role = 'tradie'
        AND p.id != NEW.client_id
        AND (
          NEW.latitude IS NULL OR NEW.longitude IS NULL
          OR p.base_latitude IS NULL OR p.base_longitude IS NULL
          OR haversine_km(NEW.latitude, NEW.longitude, p.base_latitude, p.base_longitude)
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
