/*
  # Fix Mutable Search Path on All Remaining Functions

  Sets explicit search_path = public on all 21 functions flagged by the security advisor.
  This prevents search_path hijacking attacks, especially critical for SECURITY DEFINER functions.

  ## Functions Fixed
  - update_reviews_updated_at
  - update_conversation_timestamp
  - notify_booking_request
  - delete_old_declined_jobs (SECURITY DEFINER)
  - update_calendar_integrations_updated_at
  - update_job_variations_updated_at
  - update_job_milestones_updated_at
  - update_projects_updated_at
  - notify_project_tradies_on_job_change
  - auto_assign_project_to_job (SECURITY DEFINER)
  - sync_project_status_on_agreement
  - notify_on_project_status_change
  - notify_client_on_date_change_request
  - notify_tradie_on_date_change_response
  - recompute_project_status
  - auto_complete_ended_projects (SECURITY DEFINER)
  - notify_approaching_reminders (SECURITY DEFINER)
  - get_user_conversation_ids (SECURITY DEFINER)
  - get_daily_profile_view_count (SECURITY DEFINER)
  - has_user_engagement (SECURITY DEFINER)
  - get_platform_stats
*/

-- 1. update_reviews_updated_at
CREATE OR REPLACE FUNCTION public.update_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. update_conversation_timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- 3. notify_booking_request
CREATE OR REPLACE FUNCTION public.notify_booking_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sender_name text;
  job_scheduled_time timestamptz;
BEGIN
  IF NEW.is_booking_request = true THEN
    SELECT full_name INTO sender_name
    FROM profiles
    WHERE id = NEW.sender_id;

    IF NEW.job_id IS NOT NULL THEN
      SELECT scheduled_time INTO job_scheduled_time
      FROM jobs
      WHERE id = NEW.job_id;
    END IF;

    INSERT INTO notifications (
      user_id, title, message, type, metadata
    ) VALUES (
      NEW.receiver_id,
      'New Booking Request',
      CASE
        WHEN job_scheduled_time IS NOT NULL THEN
          sender_name || ' has requested a booking for ' ||
          to_char(job_scheduled_time AT TIME ZONE 'Australia/Sydney', 'Day, DD Month YYYY at HH24:MI')
        ELSE
          sender_name || ' sent you a booking request'
      END,
      'booking_request',
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'sender_id', NEW.sender_id,
        'job_id', NEW.job_id,
        'scheduled_time', job_scheduled_time
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. delete_old_declined_jobs (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.delete_old_declined_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM jobs
  WHERE status = 'declined'
    AND declined_at IS NOT NULL
    AND declined_at < NOW() - INTERVAL '2 days';
END;
$$;

-- 5. update_calendar_integrations_updated_at
CREATE OR REPLACE FUNCTION public.update_calendar_integrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. update_job_variations_updated_at
CREATE OR REPLACE FUNCTION public.update_job_variations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 7. update_job_milestones_updated_at
CREATE OR REPLACE FUNCTION public.update_job_milestones_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 8. update_projects_updated_at
CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 9. notify_project_tradies_on_job_change
CREATE OR REPLACE FUNCTION public.notify_project_tradies_on_job_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_project_title text;
  v_tradie_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF (OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time) OR
     (OLD.is_delayed IS DISTINCT FROM NEW.is_delayed) THEN

    SELECT title INTO v_project_title
    FROM projects
    WHERE id = NEW.project_id;

    FOR v_tradie_id IN
      SELECT DISTINCT tradie_id
      FROM jobs
      WHERE project_id = NEW.project_id
      AND tradie_id != NEW.tradie_id
      AND tradie_id IS NOT NULL
      AND status IN ('accepted', 'in_progress')
    LOOP
      INSERT INTO notifications (user_id, type, title, message, reference_id)
      VALUES (
        v_tradie_id,
        'project_update',
        'Project Timeline Updated',
        'The timeline for "' || v_project_title || '" has changed. Please check the updated dates.',
        NEW.project_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 10. auto_assign_project_to_job (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.auto_assign_project_to_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_project_id uuid;
BEGIN
  IF NEW.project_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT id INTO existing_project_id
    FROM projects
    WHERE client_id = NEW.client_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF existing_project_id IS NOT NULL THEN
      NEW.project_id := existing_project_id;
    ELSE
      INSERT INTO projects (client_id, title, status)
      VALUES (NEW.client_id, 'My Project', 'active')
      RETURNING id INTO NEW.project_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 11. sync_project_status_on_agreement
CREATE OR REPLACE FUNCTION public.sync_project_status_on_agreement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_status = NEW.tradie_status THEN
    NEW.status = NEW.client_status;
    NEW.status_agreed = true;
  ELSE
    NEW.status_agreed = false;
  END IF;
  RETURN NEW;
END;
$$;

-- 12. notify_on_project_status_change
CREATE OR REPLACE FUNCTION public.notify_on_project_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_tradie_id uuid;
  v_notified_user uuid;
  v_updater_role text;
BEGIN
  v_client_id := NEW.client_id;

  SELECT DISTINCT tradie_id INTO v_tradie_id
  FROM jobs
  WHERE project_id = NEW.id
  AND status IN ('accepted', 'in_progress', 'completed')
  LIMIT 1;

  IF auth.uid() = v_client_id THEN
    v_notified_user := v_tradie_id;
    v_updater_role := 'Client';
  ELSE
    v_notified_user := v_client_id;
    v_updater_role := 'Tradie';
  END IF;

  IF NOT NEW.status_agreed AND v_notified_user IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      v_notified_user,
      'project_status_change',
      'Project Status Update Requested',
      v_updater_role || ' has updated their status for "' || NEW.title || '". Please review and update your status.',
      NEW.id
    );
  END IF;

  IF NEW.status_agreed AND NOT OLD.status_agreed THEN
    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      v_client_id,
      'project_status_agreed',
      'Project Status Agreed',
      'Both parties have agreed on the status for "' || NEW.title || '".',
      NEW.id
    );

    IF v_tradie_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, reference_id)
      VALUES (
        v_tradie_id,
        'project_status_agreed',
        'Project Status Agreed',
        'Both parties have agreed on the status for "' || NEW.title || '".',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 13. notify_client_on_date_change_request
CREATE OR REPLACE FUNCTION public.notify_client_on_date_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_project_title text;
  v_requester_name text;
  v_field_label text;
BEGIN
  SELECT p.client_id, p.title INTO v_client_id, v_project_title
  FROM projects p WHERE p.id = NEW.project_id;

  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = NEW.requester_id;

  v_field_label := CASE NEW.field_name
    WHEN 'start_date' THEN 'start date'
    WHEN 'estimated_end_date' THEN 'end date'
    ELSE NEW.field_name
  END;

  INSERT INTO notifications (user_id, type, title, message, reference_id)
  VALUES (
    v_client_id,
    'date_change_request',
    'Date Change Requested',
    COALESCE(v_requester_name, 'A tradie') || ' has requested to change the ' || v_field_label || ' for "' || v_project_title || '" to ' || to_char(NEW.requested_date, 'DD Mon YYYY') || '.',
    NEW.project_id
  );
  RETURN NEW;
END;
$$;

-- 14. notify_tradie_on_date_change_response
CREATE OR REPLACE FUNCTION public.notify_tradie_on_date_change_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_project_title text;
  v_field_label text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    NEW.responded_at = now();

    SELECT title INTO v_project_title
    FROM projects WHERE id = NEW.project_id;

    v_field_label := CASE NEW.field_name
      WHEN 'start_date' THEN 'start date'
      WHEN 'estimated_end_date' THEN 'end date'
      ELSE NEW.field_name
    END;

    INSERT INTO notifications (user_id, type, title, message, reference_id)
    VALUES (
      NEW.requester_id,
      'date_change_response',
      CASE NEW.status WHEN 'approved' THEN 'Date Change Approved' ELSE 'Date Change Declined' END,
      'Your request to change the ' || v_field_label || ' for "' || v_project_title || '" has been ' || NEW.status || '.',
      NEW.project_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 15. recompute_project_status
CREATE OR REPLACE FUNCTION public.recompute_project_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_total_jobs int;
  v_completed_jobs int;
  v_cancelled_jobs int;
  v_new_status text;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  IF v_project_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'declined'))
  INTO v_total_jobs, v_completed_jobs, v_cancelled_jobs
  FROM jobs
  WHERE project_id = v_project_id;

  IF v_total_jobs = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_completed_jobs = v_total_jobs THEN
    v_new_status := 'completed';
  ELSIF v_cancelled_jobs = v_total_jobs THEN
    v_new_status := 'cancelled';
  ELSE
    v_new_status := 'active';
  END IF;

  UPDATE projects
  SET status = v_new_status,
      client_status = v_new_status,
      tradie_status = v_new_status,
      status_agreed = true
  WHERE id = v_project_id
  AND status IS DISTINCT FROM v_new_status;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 16. auto_complete_ended_projects (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.auto_complete_ended_projects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proj RECORD;
BEGIN
  FOR proj IN
    SELECT id FROM projects
    WHERE status = 'end_date'
      AND estimated_end_date IS NOT NULL
      AND estimated_end_date::date <= CURRENT_DATE
  LOOP
    UPDATE jobs
    SET status = 'completed'
    WHERE project_id = proj.id
      AND status IN ('pending', 'accepted', 'in_progress');

    UPDATE projects
    SET status = 'completed',
        client_status = 'completed',
        tradie_status = 'completed',
        status_agreed = true,
        is_ongoing = false
    WHERE id = proj.id;
  END LOOP;
END;
$$;

-- 17. notify_approaching_reminders (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.notify_approaching_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT sr.id, sr.client_id, sr.category_name, sr.due_date, sr.tradie_id,
           p.full_name as tradie_name
    FROM service_reminders sr
    JOIN profiles p ON p.id = sr.tradie_id
    WHERE sr.status = 'pending'
      AND sr.due_date <= CURRENT_DATE + interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.metadata->>'reminder_id' = sr.id::text
          AND n.type = 'service_reminder'
      )
  LOOP
    INSERT INTO notifications (user_id, title, message, type, metadata)
    VALUES (
      r.client_id,
      'Maintenance Due: ' || replace(initcap(replace(r.category_name, '_', ' ')), '_', ' '),
      'Your ' || replace(r.category_name, '_', ' ') || ' service with ' || r.tradie_name || ' is due for maintenance. Book again to stay on schedule!',
      'service_reminder',
      jsonb_build_object('reminder_id', r.id::text, 'tradie_id', r.tradie_id::text, 'category', r.category_name)
    );

    UPDATE service_reminders SET status = 'sent' WHERE id = r.id;
  END LOOP;
END;
$$;

-- 18. get_user_conversation_ids (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT conversation_id FROM conversation_participants WHERE user_id = uid;
$$;

-- 19. get_daily_profile_view_count (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_daily_profile_view_count(viewer_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM profile_views
  WHERE viewer_id = viewer_uuid
    AND viewed_at >= CURRENT_DATE
    AND viewed_at < CURRENT_DATE + INTERVAL '1 day';
$$;

-- 20. has_user_engagement (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_user_engagement(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs
    WHERE client_id = user_uuid
    LIMIT 1
  );
$$;

-- 21. get_platform_stats
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_reviews', COUNT(*),
    'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
    'total_tradies_with_reviews', COUNT(DISTINCT tradie_id)
  )
  FROM reviews;
$$;
