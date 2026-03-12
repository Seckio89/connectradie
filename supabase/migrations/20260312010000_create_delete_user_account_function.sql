-- Safely delete a user account and all linked data in the correct order.
-- Runs as SECURITY DEFINER so RLS is bypassed, but only allows users to
-- delete their own account (enforced by the auth.uid() check).

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Delete from tables where user is referenced by various columns.
  --    Order: leaf tables first, then tables closer to profiles.

  -- Typing indicators & read receipts
  DELETE FROM typing_indicators WHERE user_id = _uid;

  -- Time entries (business_owner_id or approved_by)
  DELETE FROM time_entries WHERE business_owner_id = _uid OR approved_by = _uid;

  -- Phase team assignments
  DELETE FROM phase_team_assignments WHERE business_owner_id = _uid;

  -- Project phases
  DELETE FROM project_phases WHERE business_owner_id = _uid;

  -- Job team assignments
  DELETE FROM job_team_assignments WHERE business_owner_id = _uid;

  -- Business join requests
  DELETE FROM business_join_requests WHERE requester_id = _uid OR business_owner_id = _uid;

  -- Business team members
  DELETE FROM business_team_members WHERE business_owner_id = _uid OR member_profile_id = _uid;

  -- Abuse reports (reporter or reported)
  UPDATE abuse_reports SET resolved_by = NULL WHERE resolved_by = _uid;
  DELETE FROM abuse_reports WHERE reporter_id = _uid OR reported_user_id = _uid;

  -- Disputes
  UPDATE disputes SET resolved_by = NULL WHERE resolved_by = _uid;
  DELETE FROM disputes WHERE opened_by = _uid OR against_user = _uid;

  -- Platform recommendations
  UPDATE platform_recommendations SET reviewed_by = NULL WHERE reviewed_by = _uid;

  -- Vacancy applications
  DELETE FROM vacancy_applications WHERE applicant_id = _uid;

  -- Trade vacancies
  DELETE FROM trade_vacancies WHERE employer_id = _uid;

  -- Portfolio images
  DELETE FROM portfolio_images WHERE tradie_id = _uid;

  -- Quote templates
  DELETE FROM quote_templates WHERE tradie_id = _uid;

  -- Quotes (must go before jobs)
  DELETE FROM quotes WHERE tradie_id = _uid;

  -- Standard rates
  DELETE FROM standard_rates WHERE tradie_id = _uid;

  -- Job photos
  DELETE FROM job_photos WHERE uploaded_by = _uid;

  -- Recurring jobs
  DELETE FROM recurring_jobs WHERE client_id = _uid OR tradie_id = _uid;

  -- Service reminders
  DELETE FROM service_reminders WHERE client_id = _uid OR tradie_id = _uid;

  -- Calendar integrations
  DELETE FROM calendar_integrations WHERE tradie_id = _uid;

  -- Saved searches & email preferences
  DELETE FROM saved_searches WHERE user_id = _uid;
  DELETE FROM email_preferences WHERE user_id = _uid;

  -- Payments (must go before jobs)
  DELETE FROM payments WHERE profile_id = _uid;

  -- Job unlocks
  DELETE FROM job_unlocks WHERE tradie_id = _uid;

  -- Reviews
  DELETE FROM reviews WHERE tradie_id = _uid OR client_id = _uid;

  -- Messages (must go before conversations)
  DELETE FROM messages WHERE sender_id = _uid OR receiver_id = _uid;

  -- Conversation permissions & participants
  DELETE FROM conversation_permissions WHERE user_id = _uid OR blocked_by = _uid;
  DELETE FROM conversation_participants WHERE user_id = _uid;

  -- Conversations created by user (only if no other participants remain)
  DELETE FROM conversations WHERE created_by = _uid
    AND NOT EXISTS (
      SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id
    );

  -- Notifications
  DELETE FROM notifications WHERE user_id = _uid;

  -- Onboarding & hints
  DELETE FROM onboarding_progress WHERE user_id = _uid;
  DELETE FROM hint_tracking WHERE user_id = _uid;

  -- Availability slots
  DELETE FROM availability_slots WHERE tradie_id = _uid OR booked_by = _uid;

  -- Connections
  DELETE FROM connections WHERE tradie_id = _uid OR client_id = _uid;

  -- My trades
  DELETE FROM my_trades WHERE client_id = _uid OR tradie_id = _uid;

  -- Stripe subscriptions
  DELETE FROM stripe_subscriptions WHERE profile_id = _uid;

  -- Jobs — nullify tradie_id references first, then delete owned jobs
  UPDATE jobs SET tradie_id = NULL WHERE tradie_id = _uid;
  DELETE FROM jobs WHERE client_id = _uid;

  -- Tradie details
  DELETE FROM tradie_details WHERE profile_id = _uid;

  -- Admin audit log (nullify rather than delete for audit trail)
  UPDATE admin_audit_log SET admin_id = NULL WHERE admin_id = _uid;

  -- User update reads
  DELETE FROM user_update_reads WHERE user_id = _uid;

  -- Finally delete the profile
  DELETE FROM profiles WHERE id = _uid;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
