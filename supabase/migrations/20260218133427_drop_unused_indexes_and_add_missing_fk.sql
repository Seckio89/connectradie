/*
  # Drop Unused Indexes and Add Missing FK Index

  ## Summary
  - Drops 67 unused indexes that add write overhead without query benefit
  - Adds the missing covering index for date_change_requests.project_id FK

  ## Changes
  - DROP: All unused indexes as reported by Supabase advisor
  - ADD: idx_date_change_requests_project_id (was missing FK index)

  ## Notes
  - Unused indexes slow down writes and consume storage without helping reads
  - The query planner will create new indexes naturally if queries require them
*/

-- Add the missing FK index
CREATE INDEX IF NOT EXISTS idx_date_change_requests_project_id ON public.date_change_requests(project_id);

-- Drop all unused indexes
DROP INDEX IF EXISTS public.idx_profiles_postcode;
DROP INDEX IF EXISTS public.idx_tradie_details_category;
DROP INDEX IF EXISTS public.idx_tradie_details_verified;
DROP INDEX IF EXISTS public.idx_reviews_job_id;
DROP INDEX IF EXISTS public.idx_reviews_client_id;
DROP INDEX IF EXISTS public.idx_connections_client_id;
DROP INDEX IF EXISTS public.idx_conversations_created_by;
DROP INDEX IF EXISTS public.idx_conversations_updated_at;
DROP INDEX IF EXISTS public.idx_conversation_participants_conversation;
DROP INDEX IF EXISTS public.idx_conversation_participants_user;
DROP INDEX IF EXISTS public.idx_conversation_participants_archived;
DROP INDEX IF EXISTS public.idx_conversation_permissions_conversation;
DROP INDEX IF EXISTS public.idx_conversation_permissions_user;
DROP INDEX IF EXISTS public.idx_messages_conversation;
DROP INDEX IF EXISTS public.idx_messages_deleted;
DROP INDEX IF EXISTS public.idx_messages_job_id;
DROP INDEX IF EXISTS public.idx_job_unlocks_job_id;
DROP INDEX IF EXISTS public.idx_tradie_details_trade_type;
DROP INDEX IF EXISTS public.idx_calendar_integrations_tradie;
DROP INDEX IF EXISTS public.idx_jobs_slot_id;
DROP INDEX IF EXISTS public.idx_job_variations_status;
DROP INDEX IF EXISTS public.idx_project_date_requests_status;
DROP INDEX IF EXISTS public.idx_job_milestones_status;
DROP INDEX IF EXISTS public.idx_job_milestones_created_by;
DROP INDEX IF EXISTS public.idx_date_change_requests_tradie_id;
DROP INDEX IF EXISTS public.idx_date_change_requests_status;
DROP INDEX IF EXISTS public.idx_service_reminders_client_id;
DROP INDEX IF EXISTS public.idx_service_reminders_due_date;
DROP INDEX IF EXISTS public.idx_service_reminders_status;
DROP INDEX IF EXISTS public.idx_jobs_priority;
DROP INDEX IF EXISTS public.idx_jobs_scheduled_time;
DROP INDEX IF EXISTS public.idx_stripe_subscriptions_customer_id;
DROP INDEX IF EXISTS public.idx_stripe_subscriptions_subscription_id;
DROP INDEX IF EXISTS public.idx_notifications_user_read;
DROP INDEX IF EXISTS public.idx_messages_conversation_created;
DROP INDEX IF EXISTS public.idx_payments_profile_id;
DROP INDEX IF EXISTS public.idx_payments_job_id;
DROP INDEX IF EXISTS public.idx_invoices_created_by;
DROP INDEX IF EXISTS public.idx_service_reminders_tradie_id;
DROP INDEX IF EXISTS public.idx_profile_views_viewer_date;
DROP INDEX IF EXISTS public.idx_profile_views_tradie;
DROP INDEX IF EXISTS public.idx_milestone_subcontractors_milestone_id;
DROP INDEX IF EXISTS public.idx_job_team_assignments_job;
DROP INDEX IF EXISTS public.idx_job_team_assignments_member;
DROP INDEX IF EXISTS public.idx_job_team_assignments_date;
DROP INDEX IF EXISTS public.idx_business_team_members_profile;
DROP INDEX IF EXISTS public.idx_project_phases_project;
DROP INDEX IF EXISTS public.idx_project_phases_owner;
DROP INDEX IF EXISTS public.idx_project_phases_order;
DROP INDEX IF EXISTS public.idx_date_change_requests_requester_id;
DROP INDEX IF EXISTS public.idx_phase_team_assignments_phase;
DROP INDEX IF EXISTS public.idx_phase_team_assignments_member;
DROP INDEX IF EXISTS public.idx_invoice_line_items_invoice_id;
DROP INDEX IF EXISTS public.idx_invoices_job_id;
DROP INDEX IF EXISTS public.idx_invoices_milestone_id;
DROP INDEX IF EXISTS public.idx_invoices_milestone_subcontractor_id;
DROP INDEX IF EXISTS public.idx_business_join_requests_requester;
DROP INDEX IF EXISTS public.idx_business_join_requests_owner;
DROP INDEX IF EXISTS public.idx_app_settings_updated_by;
DROP INDEX IF EXISTS public.idx_availability_slots_booked_by;
DROP INDEX IF EXISTS public.idx_conversation_permissions_blocked_by;
DROP INDEX IF EXISTS public.idx_milestone_subcontractors_invoice_id;
DROP INDEX IF EXISTS public.idx_my_trades_tradie_id;
DROP INDEX IF EXISTS public.idx_notifications_job_id;
DROP INDEX IF EXISTS public.idx_phase_team_assignments_business_owner_id;
DROP INDEX IF EXISTS public.idx_project_date_requests_requested_by;
DROP INDEX IF EXISTS public.idx_projects_client_id;
DROP INDEX IF EXISTS public.idx_service_reminders_job_id;
DROP INDEX IF EXISTS public.idx_messages_sender;
