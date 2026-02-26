/*
  # Fix Unindexed Foreign Keys

  Adds covering indexes for all foreign key columns that were missing indexes.
  This improves query performance for JOIN operations and cascading operations.

  ## New Indexes
  - app_settings.updated_by
  - availability_slots.booked_by
  - conversation_permissions.blocked_by
  - date_change_requests.project_id
  - date_change_requests.requester_id
  - invoice_line_items.invoice_id
  - invoices.job_id
  - invoices.milestone_id
  - invoices.milestone_subcontractor_id
  - milestone_subcontractors.invoice_id
  - my_trades.tradie_id
  - notifications.job_id
  - phase_team_assignments.business_owner_id
  - project_date_requests.requested_by
  - projects.client_id
  - service_reminders.job_id
*/

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by ON public.app_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_availability_slots_booked_by ON public.availability_slots(booked_by);
CREATE INDEX IF NOT EXISTS idx_conversation_permissions_blocked_by ON public.conversation_permissions(blocked_by);
CREATE INDEX IF NOT EXISTS idx_date_change_requests_project_id ON public.date_change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_date_change_requests_requester_id ON public.date_change_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON public.invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_milestone_id ON public.invoices(milestone_id);
CREATE INDEX IF NOT EXISTS idx_invoices_milestone_subcontractor_id ON public.invoices(milestone_subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_milestone_subcontractors_invoice_id ON public.milestone_subcontractors(invoice_id);
CREATE INDEX IF NOT EXISTS idx_my_trades_tradie_id ON public.my_trades(tradie_id);
CREATE INDEX IF NOT EXISTS idx_notifications_job_id ON public.notifications(job_id);
CREATE INDEX IF NOT EXISTS idx_phase_team_assignments_business_owner_id ON public.phase_team_assignments(business_owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_service_reminders_job_id ON public.service_reminders(job_id);
