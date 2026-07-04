-- Per-service worker assignment for ongoing services (Work Hub > Services).
-- One team member handles all visits for a client (per-visit assignment can
-- come later). Stored on recurring_jobs; the tradie's existing UPDATE policy
-- (auth.uid() IN (client_id, tradie_id)) already covers writing it.
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS assigned_team_member_id uuid REFERENCES business_team_members(id) ON DELETE SET NULL;

-- Notify the assigned worker (mirrors the vacancy/application trigger pattern:
-- SECURITY DEFINER insert into notifications). Only fires when the assignment
-- actually changes to a member, and only if that member has a linked profile
-- (invite-only members have nowhere to receive an in-app notification).
CREATE OR REPLACE FUNCTION public.notify_service_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_profile uuid;
  v_owner_name text;
  v_client_name text;
  v_label text;
BEGIN
  SELECT member_profile_id INTO v_member_profile
  FROM business_team_members WHERE id = NEW.assigned_team_member_id;

  IF v_member_profile IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(td.business_name, ''), p.full_name, 'Your employer')
    INTO v_owner_name
  FROM profiles p
  LEFT JOIN tradie_details td ON td.profile_id = p.id
  WHERE p.id = NEW.tradie_id;

  SELECT full_name INTO v_client_name FROM profiles WHERE id = NEW.client_id;

  v_label := COALESCE(NULLIF(NEW.service_subtype, ''), replace(NEW.trade_category, '_', ' '), 'ongoing service');

  INSERT INTO notifications (user_id, title, message, type, channel, metadata, read)
  VALUES (
    v_member_profile,
    'Assigned To An Ongoing Service',
    v_owner_name || ' assigned you to the ' || v_label || ' service for ' || COALESCE(v_client_name, 'a client')
      || CASE WHEN COALESCE(NEW.location, '') <> '' THEN ' — ' || split_part(NEW.location, ',', 1) ELSE '' END,
    'service_assignment',
    'in_app',
    jsonb_build_object('recurring_job_id', NEW.id, 'team_member_id', NEW.assigned_team_member_id),
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_service_assignment ON recurring_jobs;
CREATE TRIGGER trg_notify_service_assignment
  AFTER UPDATE OF assigned_team_member_id ON recurring_jobs
  FOR EACH ROW
  WHEN (NEW.assigned_team_member_id IS NOT NULL
        AND NEW.assigned_team_member_id IS DISTINCT FROM OLD.assigned_team_member_id)
  EXECUTE FUNCTION public.notify_service_assignment();
