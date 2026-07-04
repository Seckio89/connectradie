export type UserRole = 'client' | 'tradie' | 'admin';
export type SubscriptionTier = 'free' | 'pro' | 'business';
export type SlotStatus = 'available' | 'booked' | 'blocked';
export type JobStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'declined' | 'funded';
export type QuoteStatus =
  | 'pending'
  | 'site_visit_scheduled'    // 3-stage flow: client booked the site visit
  | 'site_visit_completed'    // 3-stage flow: tradie marked the visit done
  | 'final_submitted'         // 3-stage flow: tradie's binding quote with final_price
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired';
export type QuotingStatus = 'open' | 'closed' | 'awarded';
export type ProjectStatus = 'active' | 'completed' | 'cancelled' | 'ongoing' | 'end_date';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole | null;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  suburb: string | null;
  abn_number: string | null;
  abn_entity_name: string | null;
  abn_verified: boolean;
  is_gst_registered: boolean;
  license_number: string | null;
  license_expiry: string | null;
  license_state: string | null;
  license_verified: boolean;
  license_holder_name: string | null;
  license_api_verified: boolean;
  license_class: string | null;
  is_apprentice: boolean;
  supervisor_license: string | null;
  supervisor_name: string | null;
  is_license_required: boolean;
  verification_status: VerificationStatus;
  documents_url: string[] | null;
  rejection_reason: string | null;
  onboarding_completed: boolean;
  is_premium: boolean;
  subscription_expiry: string | null;
  push_enabled: boolean;
  sms_alerts_enabled: boolean;
  push_subscription: Record<string, unknown> | null;
  insurance_policy: boolean;
  service_radius_km: number;
  is_emergency_available: boolean;
  team_size: string | null;
  call_out_fee: number | null;
  show_callout_fee: boolean;
  callout_fee_waived_on_proceed: boolean;
  auto_complete_sessions: boolean;
  bio: string | null;
  cover_photo_url: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarding_complete: boolean;
  stripe_customer_id: string | null;
  employer_id: string | null;
  employment_type: 'employee' | 'subcontractor' | 'none';
  employer_status: 'active' | 'pending_approval' | 'rejected' | 'none';
  declared_trades: string[];
  verified_trades: string[];
  license_trades: string[];
  stripe_identity_session_id: string | null;
  is_identity_verified: boolean;
  created_at: string;
}

export type TradieDetails = {
  id: string;
  profile_id: string;
  business_name: string;
  trade_category: string;
  abn: string | null;
  license_number: string | null;
  is_verified: boolean;
  is_insured: boolean;
  is_licensed: boolean;
  subscription_tier: SubscriptionTier;
  default_call_out_fee_cents: number | null;
  service_radius_km: number;
  bio: string | null;
  hourly_rate: number | null;
  emergency_available: boolean;
  insurance_provider: string;
  policy_number: string;
  qualifications: string[];
  contractor_type: 'Solo' | 'Company' | 'Labour Hire';
  insurance_document_url: string | null;
  trade_type: 'construction' | 'hospitality';
  food_safety_cert: string | null;
  cookery_cert: string | null;
  white_card: string | null;
  created_at: string;
}

export type Project = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  estimated_end_date: string | null;
  is_ongoing: boolean;
  end_reason: string | null;
  status: ProjectStatus;
  client_status: ProjectStatus;
  tradie_status: ProjectStatus;
  status_agreed: boolean;
  client_status_updated_at: string;
  tradie_status_updated_at: string;
  created_at: string;
  updated_at: string;
}

export type MyTrade = {
  id: string;
  client_id: string;
  tradie_id: string;
  created_at: string;
}

export type AvailabilitySlot = {
  id: string;
  tradie_id: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  booked_by: string | null;
  created_at: string;
}

export type BudgetType = 'request_quote' | 'fixed_budget' | 'hourly_rate';
export type JobComplexity = 'standard' | 'emergency' | 'complex';

export type OnboardingProgress = {
  id: string;
  user_id: string;
  profile_complete: boolean;
  avatar_complete: boolean;
  trades_added: boolean;
  availability_set: boolean;
  first_job_viewed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type HintTracking = {
  id: string;
  user_id: string;
  hint_key: string;
  dismissed_at: string | null;
  view_count: number;
  created_at: string;
}

export type Job = {
  id: string;
  client_id: string;
  tradie_id: string | null;
  title: string | null;
  description: string;
  status: JobStatus;
  scheduled_time: string | null;
  slot_id: string | null;
  images_url: string[] | null;
  estimated_duration: string | null;
  is_emergency: boolean;
  decline_reason: string | null;
  declined_at: string | null;
  priority: 'low' | 'normal' | 'high';
  is_delayed: boolean;
  delayed_until: string | null;
  notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  location_address: string | null;
  parking_available: boolean | null;
  budget_type: BudgetType | null;
  budget_amount: number | null;
  access_instructions: string | null;
  job_complexity: JobComplexity | null;
  project_id: string | null;
  is_flash_boost: boolean;
  flash_expiry: string | null;
  scheduled_date: string | null;
  preferred_time_slot: 'morning' | 'midday' | 'afternoon' | 'evening' | null;
  start_time: string | null;
  end_time: string | null;
  time_confirmed: boolean;
  emergency_fee_applied: boolean;
  completion_notes: string | null;
  completion_photo_url: string | null;
  max_quotes: number;
  quote_count: number;
  allows_site_inspection: boolean;
  quoting_status: QuotingStatus;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  contact_flagged: boolean;
  contact_flag_reason: string | null;
  recurring_job_id: string | null;
  // Quote flow: 1 = legacy single-step accept-and-pay. 2 = 3-stage estimate /
  // site visit / final quote / pay. See docs/three-stage-quote-flow.md.
  flow_version: number;
  updated_at: string;
  created_at: string;
}

export type Quote = {
  id: string;
  job_id: string;
  tradie_id: string;
  price_min: number;
  price_max: number;
  firm_price: number | null;
  message: string;
  estimated_duration: string | null;
  includes_materials: boolean;
  requires_site_inspection: boolean;
  final_price: number | null;
  status: QuoteStatus;
  accepted_at: string | null;
  proposed_start_date: string | null;
  // 3-stage flow tracking (active when the parent job has flow_version=2).
  // See docs/three-stage-quote-flow.md for the full state machine.
  site_visit_scheduled_at: string | null;
  site_visit_ends_at: string | null;
  site_visit_time_confirmed: boolean | null;
  site_visit_completed_at: string | null;
  final_submitted_at: string | null;
  final_valid_until: string | null;
  // Tradie-set site-visit call-out fee (paid by client at booking, credited at accept).
  call_out_fee_cents: number | null;
  site_visit_fee_status: 'paid' | 'credited' | null;
  site_visit_fee_paid_at: string | null;
  site_visit_fee_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteWithTradie = Quote & {
  tradie_profile?: {
    full_name: string;
    avatar_url: string | null;
    verification_status: VerificationStatus;
    verified_trades: string[];
    declared_trades: string[];
    is_gst_registered?: boolean;
    /** When the tradie joined the platform — used for the "Member since YYYY"
     *  retention signal on quote cards. */
    created_at?: string;
  } | null;
  tradie_details?: {
    business_name: string;
    trade_category: string;
    is_verified: boolean;
    is_insured: boolean;
    subscription_tier: SubscriptionTier;
  } | null;
  review_stats?: {
    avg_rating: number;
    total_reviews: number;
    total_jobs_completed: number;
  } | null;
}

export type Conversation = {
  id: string;
  title: string | null;
  is_group: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_admin: boolean;
  archived_at: string | null;
}

export type ConversationPermission = {
  id: string;
  conversation_id: string;
  user_id: string;
  blocked_by: string;
  can_see_phone: boolean;
  can_see_email: boolean;
  can_see_address: boolean;
  created_at: string;
}

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string | null;
  content: string;
  image_url: string | null;
  is_booking_request: boolean;
  job_id: string | null;
  read_at: string | null;
  read_by: string[] | null;
  deleted_at: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  created_at: string;
}

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  notification_type: string | null;
  channel: 'sms' | 'in_app' | 'email';
  read: boolean;
  read_at: string | null;
  sms_sent_at: string | null;
  email_sent_at: string | null;
  metadata: {
    conversation_id?: string;
    message_id?: string;
    sender_id?: string;
    job_id?: string;
    [key: string]: unknown;
  } | null;
  link: string | null;
  job_id: string | null;
  created_at: string;
}

export type CalendarIntegration = {
  id: string;
  tradie_id: string;
  provider: 'google' | 'outlook' | 'apple';
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
  calendar_id: string | null;
  last_synced_at: string | null;
  sync_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ServiceReminderStatus = 'pending' | 'sent' | 'booked' | 'dismissed';

export type ServiceReminder = {
  id: string;
  client_id: string;
  tradie_id: string;
  job_id: string;
  category_name: string;
  location_address: string | null;
  due_date: string;
  status: ServiceReminderStatus;
  created_at: string;
  tradie_name?: string;
  tradie_business?: string;
}

export type Review = {
  id: string;
  job_id: string | null;
  recurring_job_id: string | null;
  tradie_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export type Connection = {
  id: string;
  tradie_id: string;
  client_id: string;
  unlocked_at: string;
  amount_paid: number;
  created_at: string;
}

export type JobUnlock = {
  id: string;
  tradie_id: string;
  job_id: string;
  unlocked_at: string;
  amount_paid: number;
  created_at: string;
}

export type JobVariation = {
  id: string;
  job_id: string;
  description: string;
  additional_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export type JobMilestone = {
  id: string;
  job_id: string;
  title: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid';
  due_date: string | null;
  created_by: string;
  approved_at: string | null;
  paid_at: string | null;
  stage_number: number;
  proof_images: string[];
  payment_type: string;
  invoice_number: string | null;
  subcontractor_business_name: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneSubcontractor = {
  id: string;
  milestone_id: string;
  business_name: string;
  invoice_number: string | null;
  amount: number;
  invoice_id: string | null;
  created_at: string;
}

export type Invoice = {
  id: string;
  created_by: string;
  job_id: string | null;
  milestone_id: string | null;
  milestone_subcontractor_id: string | null;
  business_name: string;
  business_abn: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  bill_to_name: string | null;
  bill_to_address: string | null;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  notes: string | null;
  status: 'draft' | 'sent' | 'paid';
  created_at: string;
  updated_at: string;
}

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  created_at: string;
}

export type StripeSubscription = {
  id: string;
  profile_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export type AppSetting = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export type BusinessTeamMember = {
  id: string;
  business_owner_id: string;
  member_profile_id: string | null;
  invite_email: string | null;
  invite_name: string;
  invite_phone: string;
  role: 'employee' | 'subcontractor' | 'apprentice';
  trade_specialty: string;
  status: 'invited' | 'active' | 'inactive';
  hourly_rate: number;
  notes: string;
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  created_at: string;
}

export type DateChangeFieldName = 'start_date' | 'estimated_end_date';
export type DateChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export type DateChangeRequest = {
  id: string;
  project_id: string;
  requester_id: string;
  field_name: DateChangeFieldName;
  requested_date: string;
  reason: string;
  status: DateChangeRequestStatus;
  created_at: string;
  responded_at: string | null;
}

export type JobTeamAssignment = {
  id: string;
  job_id: string;
  team_member_id: string;
  business_owner_id: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  role_on_job: string;
  notes: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export type ProfileView = {
  id: string;
  viewer_id: string;
  tradie_id: string;
  viewed_at: string;
}

export type TradieRatingView = {
  tradie_id: string;
  total_reviews: number;
  average_rating: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  two_star_count: number;
  one_star_count: number;
}

export type VacancyRoleType = 'apprentice' | 'qualified' | 'senior_advisory' | 'non_trade';
export type VacancyStatus = 'open' | 'closed';
export type ApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected';
export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contract' | 'subcontract' | 'apprenticeship';
export type PayPeriod = 'hour' | 'day' | 'week' | 'year';

export type TradeVacancy = {
  id: string;
  employer_id: string;
  title: string;
  role_type: VacancyRoleType;
  description: string;
  trade_category: string;
  location: string;
  status: VacancyStatus;
  created_at: string;
  updated_at: string;
  // Detail fields (added 2026-07-04) — all optional / nullable
  employment_type: EmploymentType | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: PayPeriod | null;
  pay_note: string | null;
  required_tickets: string[];
  hours: string | null;
  start_date: string | null;
  experience_level: string | null;
  closing_date: string | null;
}

export type VacancyApplication = {
  id: string;
  vacancy_id: string;
  applicant_id: string;
  cover_letter: string;
  status: ApplicationStatus;
  created_at: string;
}

/** Row shape of the public_vacancies view — safe columns for the public /careers pages. */
export type PublicVacancy = {
  id: string;
  title: string;
  role_type: VacancyRoleType;
  description: string;
  trade_category: string;
  location: string;
  employment_type: EmploymentType | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: PayPeriod | null;
  pay_note: string | null;
  required_tickets: string[];
  hours: string | null;
  start_date: string | null;
  experience_level: string | null;
  closing_date: string | null;
  created_at: string;
  employer_business_name: string | null;
  employer_name: string | null;
  employer_verified: boolean;
}

export type PortfolioImage = {
  id: string;
  tradie_id: string;
  image_url: string;
  caption: string;
  sort_order: number;
  created_at: string;
}

export type TradeVacancyWithEmployer = TradeVacancy & {
  employer?: {
    full_name: string;
    avatar_url: string | null;
    verification_status: VerificationStatus;
  } | null;
  employer_details?: {
    business_name: string;
    trade_category: string;
    is_verified: boolean;
  } | null;
  application_count?: number;
}

export type VacancyApplicationWithApplicant = VacancyApplication & {
  applicant?: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  applicant_details?: {
    trade_category: string;
    business_name: string;
  } | null;
}

export type PaymentType = 'lead_unlock' | 'job_access' | 'job_funding' | 'price_adjustment';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type Payment = {
  id: string;
  profile_id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  payment_type: PaymentType;
  job_id: string | null;
  amount: number;
  processing_fee: number | null;
  currency: string;
  status: PaymentStatus;
  metadata: Record<string, unknown> | null;
  original_amount: number | null;
  parent_payment_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export type Dispute = {
  id: string;
  job_id: string;
  opened_by: string;
  against_user: string;
  reason: string;
  description: string | null;
  evidence_urls: string[] | null;
  status: DisputeStatus;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  stripe_dispute_id: string | null;
  stripe_charge_id: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

export type TypingIndicator = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  updated_at: string;
}

export type AccountRemoval = {
  id: string;
  user_id: string;
  reason: string | null;
  requested_at: string;
  processed_at: string | null;
  status: 'pending' | 'processed' | 'reinstated';
  reinstated_at: string | null;
}

export type AdminAuditLog = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type StripeCustomer = {
  id: string;
  user_id: string;
  customer_id: string;
  deleted_at: string | null;
  created_at: string;
}

export type SmsSendLog = {
  id: string;
  phone_number: string;
  notification_type: string | null;
  sent_at: string;
}

export type PaymentReconciliationLog = {
  id: string;
  payment_id: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  details: Record<string, unknown> | null;
  reconciled_at: string;
}

export type QuoteTemplate = {
  id: string;
  tradie_id: string;
  name: string;
  message: string;
  includes_materials: boolean;
  created_at: string;
  updated_at: string;
}

export type TimeEntry = {
  id: string;
  job_id: string;
  tradie_id: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  created_at: string;
}

export type TradeCategory = {
  id: string;
  name: string;
  default_reminder_months: number;
  created_at: string;
}

export type SystemSettings = {
  id: number;
  is_training_mode_active: boolean;
  updated_at: string;
}

export type StandardRate = {
  id: string;
  tradie_id: string;
  service_name: string;
  description: string | null;
  price_per_hour: number | null;
  flat_rate: number | null;
  includes_materials: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type JobPhotoStage = 'before' | 'during' | 'after';

export type JobPhoto = {
  id: string;
  job_id: string;
  uploaded_by: string;
  photo_url: string;
  stage: JobPhotoStage;
  caption: string | null;
  add_to_portfolio: boolean;
  created_at: string;
}

export type RecurringJob = {
  id: string;
  client_id: string;
  tradie_id: string | null;
  original_job_id: string | null;
  trade_category: string;
  description: string | null;
  frequency_months: number;
  auto_remind: boolean;
  reminder_days_before: number;
  next_due_date: string | null;
  last_completed_at: string | null;
  times_completed: number;
  is_active: boolean;
  cancelled_at: string | null;
  // Optional preferred visit time (HH:MM) used by SiteCalendar and the
  // recurring-job helpers to anchor sessions. Multiple call sites already
  // read this field via inline casts — declared here so the casts can drop.
  preferred_time: string | null;
  service_subtype: string | null;
  agreed_price: number | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  alert_enabled: boolean;
  last_alerted_at: string | null;
  created_at: string;
}

export type EmailPreference = {
  id: string;
  user_id: string;
  category: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type AbuseReportType = 'spam' | 'fake_review' | 'harassment' | 'contact_scraping' | 'other';
export type AbuseReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AbuseReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

export type AbuseReport = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  report_type: AbuseReportType;
  description: string | null;
  evidence_urls: string[] | null;
  severity: AbuseReportSeverity;
  status: AbuseReportStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export type RecommendationCategory = 'growth' | 'pricing' | 'promotions' | 'trends' | 'operations';
export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationStatus = 'new' | 'reviewed' | 'implemented' | 'dismissed';

export type PlatformRecommendation = {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  data_snapshot: Record<string, unknown> | null;
  action_url: string | null;
  generated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type JobWithRelations = Job & {
  profiles?: {
    full_name: string;
    email: string;
    phone?: string;
  } | null;
  projects?: {
    id: string;
    title: string;
  } | null;
}

export type TradieWithDetails = Profile & {
  tradie_details: TradieDetails | null;
  availability_hours?: number;
}

// ── Ongoing Services ────────────────────────────────────────

export type ServiceAgreementFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'as_needed';
export type ServiceAgreementBillingCycle = 'weekly' | 'fortnightly' | 'monthly' | 'on_request';
export type ServiceAgreementStatus = 'active' | 'paused' | 'ended';
export type ServiceVisitType = 'regular' | 'extra' | 'makeup' | 'final';
export type ServiceVisitStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type ServiceInvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';

export type ServiceAgreement = {
  id: string;
  client_id: string;
  tradie_id: string;
  title: string;
  description: string | null;
  trade_category: string;
  address: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  rate_per_visit: number;
  rate_includes_gst: boolean;
  typical_frequency: ServiceAgreementFrequency;
  typical_day: string | null;
  typical_time: string | null;
  notes: string | null;
  billing_cycle: ServiceAgreementBillingCycle;
  status: ServiceAgreementStatus;
  original_job_id: string | null;
  original_quote_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceVisit = {
  id: string;
  agreement_id: string;
  visit_date: string;
  visit_type: ServiceVisitType;
  amount: number;
  amount_includes_gst: boolean;
  status: ServiceVisitStatus;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceInvoice = {
  id: string;
  agreement_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  gst_amount: number;
  total: number;
  visit_count: number;
  status: ServiceInvoiceStatus;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  sent_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

// ── Supplies tracking for recurring services ──
export type SupplyItem = {
  id: string;
  name: string;
  unit?: string;
  provided_by: 'tradie' | 'client';
  stock_level: number | null;
  restock_threshold: number | null;
  restock_notified_at: string | null;
  notes?: string;
};

export type SupplyUsage = {
  supply_id: string;
  name: string;
  quantity_used: number;
  cost: number;
};

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: AppSetting;
        Insert: Partial<Omit<AppSetting, 'updated_at'>>;
        Update: Partial<AppSetting>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Omit<Profile, 'created_at'>>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      tradie_details: {
        Row: TradieDetails;
        Insert: Partial<Omit<TradieDetails, 'id' | 'created_at'>>;
        Update: Partial<Omit<TradieDetails, 'id' | 'created_at'>>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      my_trades: {
        Row: MyTrade;
        Insert: Partial<Omit<MyTrade, 'id' | 'created_at'>>;
        Update: Partial<Omit<MyTrade, 'id' | 'created_at'>>;
        Relationships: [];
      };
      availability_slots: {
        Row: AvailabilitySlot;
        Insert: Partial<Omit<AvailabilitySlot, 'id' | 'created_at'>>;
        Update: Partial<Omit<AvailabilitySlot, 'id' | 'created_at'>>;
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: Partial<Omit<Job, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Job, 'id' | 'created_at'>>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Omit<Conversation, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Conversation, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      conversation_participants: {
        Row: ConversationParticipant;
        Insert: Partial<Omit<ConversationParticipant, 'id' | 'joined_at'>>;
        Update: Partial<Omit<ConversationParticipant, 'id' | 'joined_at'>>;
        Relationships: [];
      };
      conversation_permissions: {
        Row: ConversationPermission;
        Insert: Partial<Omit<ConversationPermission, 'id' | 'created_at'>>;
        Update: Partial<Omit<ConversationPermission, 'id' | 'created_at'>>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Omit<Message, 'id' | 'created_at'>>;
        Update: Partial<Omit<Message, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Partial<Omit<Notification, 'id' | 'created_at'>>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      connections: {
        Row: Connection;
        Insert: Partial<Omit<Connection, 'id' | 'created_at'>>;
        Update: Partial<Omit<Connection, 'id' | 'created_at'>>;
        Relationships: [];
      };
      job_unlocks: {
        Row: JobUnlock;
        Insert: Partial<Omit<JobUnlock, 'id' | 'created_at'>>;
        Update: Partial<Omit<JobUnlock, 'id' | 'created_at'>>;
        Relationships: [];
      };
      quotes: {
        Row: Quote;
        Insert: Partial<Omit<Quote, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Quote, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      job_variations: {
        Row: JobVariation;
        Insert: Partial<Omit<JobVariation, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<JobVariation, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      job_milestones: {
        Row: JobMilestone;
        Insert: Partial<Omit<JobMilestone, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<JobMilestone, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      milestone_subcontractors: {
        Row: MilestoneSubcontractor;
        Insert: Partial<Omit<MilestoneSubcontractor, 'id' | 'created_at'>>;
        Update: Partial<Omit<MilestoneSubcontractor, 'id' | 'created_at'>>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      invoice_line_items: {
        Row: InvoiceLineItem;
        Insert: Partial<Omit<InvoiceLineItem, 'id' | 'created_at'>>;
        Update: Partial<Omit<InvoiceLineItem, 'id' | 'created_at'>>;
        Relationships: [];
      };
      calendar_integrations: {
        Row: CalendarIntegration;
        Insert: Partial<Omit<CalendarIntegration, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<CalendarIntegration, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      service_reminders: {
        Row: ServiceReminder;
        Insert: Partial<Omit<ServiceReminder, 'id' | 'created_at'>>;
        Update: Partial<Omit<ServiceReminder, 'id' | 'created_at'>>;
        Relationships: [];
      };
      stripe_subscriptions: {
        Row: StripeSubscription;
        Insert: Partial<Omit<StripeSubscription, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<StripeSubscription, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      payments: {
        Row: Payment;
        Insert: Partial<Omit<Payment, 'id' | 'created_at'>>;
        Update: Partial<Omit<Payment, 'id' | 'created_at'>>;
        Relationships: [];
      };
      onboarding_progress: {
        Row: OnboardingProgress;
        Insert: Partial<Omit<OnboardingProgress, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<OnboardingProgress, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      hint_tracking: {
        Row: HintTracking;
        Insert: Partial<Omit<HintTracking, 'id' | 'created_at'>>;
        Update: Partial<Omit<HintTracking, 'id' | 'created_at'>>;
        Relationships: [];
      };
      trade_categories: {
        Row: TradeCategory;
        Insert: Partial<Omit<TradeCategory, 'id' | 'created_at'>>;
        Update: Partial<Omit<TradeCategory, 'id' | 'created_at'>>;
        Relationships: [];
      };
      system_settings: {
        Row: SystemSettings;
        Insert: Partial<SystemSettings>;
        Update: Partial<Omit<SystemSettings, 'id'>>;
        Relationships: [];
      };
      trade_vacancies: {
        Row: TradeVacancy;
        Insert: Partial<Omit<TradeVacancy, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<TradeVacancy, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      vacancy_applications: {
        Row: VacancyApplication;
        Insert: Partial<Omit<VacancyApplication, 'id' | 'created_at'>>;
        Update: Partial<Omit<VacancyApplication, 'id' | 'created_at'>>;
        Relationships: [];
      };
      business_team_members: {
        Row: BusinessTeamMember;
        Insert: Partial<Omit<BusinessTeamMember, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<BusinessTeamMember, 'id' | 'created_at'>>;
        Relationships: [];
      };
      contact_messages: {
        Row: ContactMessage;
        Insert: Partial<Omit<ContactMessage, 'id' | 'created_at'>>;
        Update: Partial<Omit<ContactMessage, 'id' | 'created_at'>>;
        Relationships: [];
      };
      date_change_requests: {
        Row: DateChangeRequest;
        Insert: Partial<Omit<DateChangeRequest, 'id' | 'created_at'>>;
        Update: Partial<Omit<DateChangeRequest, 'id' | 'created_at'>>;
        Relationships: [];
      };
      job_team_assignments: {
        Row: JobTeamAssignment;
        Insert: Partial<Omit<JobTeamAssignment, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<JobTeamAssignment, 'id' | 'created_at'>>;
        Relationships: [];
      };
      portfolio_images: {
        Row: PortfolioImage;
        Insert: Partial<Omit<PortfolioImage, 'id' | 'created_at'>>;
        Update: Partial<Omit<PortfolioImage, 'id' | 'created_at'>>;
        Relationships: [];
      };
      profile_views: {
        Row: ProfileView;
        Insert: Partial<Omit<ProfileView, 'id' | 'viewed_at'>>;
        Update: Partial<Omit<ProfileView, 'id' | 'viewed_at'>>;
        Relationships: [];
      };
      standard_rates: {
        Row: StandardRate;
        Insert: Partial<Omit<StandardRate, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<StandardRate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      job_photos: {
        Row: JobPhoto;
        Insert: Partial<Omit<JobPhoto, 'id' | 'created_at'>>;
        Update: Partial<Omit<JobPhoto, 'id' | 'created_at'>>;
        Relationships: [];
      };
      recurring_jobs: {
        Row: RecurringJob;
        Insert: Partial<Omit<RecurringJob, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<RecurringJob, 'id' | 'created_at'>>;
        Relationships: [];
      };
      saved_searches: {
        Row: SavedSearch;
        Insert: Partial<Omit<SavedSearch, 'id' | 'created_at'>>;
        Update: Partial<Omit<SavedSearch, 'id' | 'created_at'>>;
        Relationships: [];
      };
      email_preferences: {
        Row: EmailPreference;
        Insert: Partial<Omit<EmailPreference, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<EmailPreference, 'id' | 'created_at'>>;
        Relationships: [];
      };
      abuse_reports: {
        Row: AbuseReport;
        Insert: Partial<Omit<AbuseReport, 'id' | 'created_at'>>;
        Update: Partial<Omit<AbuseReport, 'id' | 'created_at'>>;
        Relationships: [];
      };
      disputes: {
        Row: Dispute;
        Insert: Partial<Omit<Dispute, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Dispute, 'id' | 'created_at'>>;
        Relationships: [];
      };
      typing_indicators: {
        Row: TypingIndicator;
        Insert: Partial<Omit<TypingIndicator, 'id'>>;
        Update: Partial<Omit<TypingIndicator, 'id'>>;
        Relationships: [];
      };
      account_removals: {
        Row: AccountRemoval;
        Insert: Partial<Omit<AccountRemoval, 'id'>>;
        Update: Partial<Omit<AccountRemoval, 'id'>>;
        Relationships: [];
      };
      admin_audit_log: {
        Row: AdminAuditLog;
        Insert: Partial<Omit<AdminAuditLog, 'id' | 'created_at'>>;
        Update: Partial<Omit<AdminAuditLog, 'id' | 'created_at'>>;
        Relationships: [];
      };
      stripe_customers: {
        Row: StripeCustomer;
        Insert: Partial<Omit<StripeCustomer, 'id' | 'created_at'>>;
        Update: Partial<Omit<StripeCustomer, 'id' | 'created_at'>>;
        Relationships: [];
      };
      sms_send_log: {
        Row: SmsSendLog;
        Insert: Partial<Omit<SmsSendLog, 'id' | 'sent_at'>>;
        Update: Partial<Omit<SmsSendLog, 'id' | 'sent_at'>>;
        Relationships: [];
      };
      payment_reconciliation_log: {
        Row: PaymentReconciliationLog;
        Insert: Partial<Omit<PaymentReconciliationLog, 'id' | 'reconciled_at'>>;
        Update: Partial<Omit<PaymentReconciliationLog, 'id' | 'reconciled_at'>>;
        Relationships: [];
      };
      quote_templates: {
        Row: QuoteTemplate;
        Insert: Partial<Omit<QuoteTemplate, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<QuoteTemplate, 'id' | 'created_at'>>;
        Relationships: [];
      };
      time_entries: {
        Row: TimeEntry;
        Insert: Partial<Omit<TimeEntry, 'id' | 'created_at'>>;
        Update: Partial<Omit<TimeEntry, 'id' | 'created_at'>>;
        Relationships: [];
      };
      service_agreements: {
        Row: ServiceAgreement;
        Insert: Partial<Omit<ServiceAgreement, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<ServiceAgreement, 'id' | 'created_at'>>;
        Relationships: [];
      };
      service_visits: {
        Row: ServiceVisit;
        Insert: Partial<Omit<ServiceVisit, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<ServiceVisit, 'id' | 'created_at'>>;
        Relationships: [];
      };
      service_invoices: {
        Row: ServiceInvoice;
        Insert: Partial<Omit<ServiceInvoice, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<ServiceInvoice, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      tradie_ratings: {
        Row: TradieRatingView;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};
