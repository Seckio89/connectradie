export type UserRole = 'client' | 'tradie' | 'admin';
export type SubscriptionTier = 'free' | 'pro' | 'business';
export type SlotStatus = 'available' | 'booked' | 'blocked';
export type JobStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'declined' | 'funded';
export type QuoteStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type QuotingStatus = 'open' | 'closed' | 'awarded';
export type ProjectStatus = 'active' | 'completed' | 'cancelled' | 'ongoing' | 'end_date';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole | null;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  abn_number: string | null;
  abn_entity_name: string | null;
  abn_verified: boolean;
  license_number: string | null;
  license_expiry: string | null;
  license_state: string | null;
  license_verified: boolean;
  license_holder_name: string | null;
  license_api_verified: boolean;
  license_class: string | null;
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
  bio: string | null;
  cover_photo_url: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarding_complete: boolean;
  employer_id: string | null;
  employment_type: 'employee' | 'subcontractor' | 'none';
  employer_status: 'active' | 'pending_approval' | 'rejected' | 'none';
  declared_trades: string[];
  verified_trades: string[];
  license_trades: string[];
  created_at: string;
}

export interface TradieDetails {
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

export interface Project {
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

export interface MyTrade {
  id: string;
  client_id: string;
  tradie_id: string;
  created_at: string;
}

export interface AvailabilitySlot {
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

export interface OnboardingProgress {
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

export interface HintTracking {
  id: string;
  user_id: string;
  hint_key: string;
  dismissed_at: string | null;
  view_count: number;
  created_at: string;
}

export interface Job {
  id: string;
  client_id: string;
  tradie_id: string | null;
  description: string;
  status: JobStatus;
  scheduled_time: string | null;
  slot_id: string | null;
  images_url: string[] | null;
  estimated_duration: string | null;
  is_emergency: boolean;
  decline_reason: string | null;
  declined_at: string | null;
  priority: 'standard' | 'urgent';
  is_delayed: boolean;
  delayed_until: string | null;
  notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  location_address: string | null;
  budget_type: BudgetType | null;
  budget_amount: number | null;
  access_instructions: string | null;
  job_complexity: JobComplexity | null;
  project_id: string | null;
  is_flash_boost: boolean;
  flash_expiry: string | null;
  scheduled_date: string | null;
  preferred_time_slot: 'morning' | 'midday' | 'afternoon' | 'evening' | null;
  emergency_fee_applied: boolean;
  completion_notes: string | null;
  completion_photo_url: string | null;
  max_quotes: number;
  quote_count: number;
  allows_site_inspection: boolean;
  quoting_status: QuotingStatus;
  updated_at: string;
  created_at: string;
}

export interface Quote {
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
  status: QuoteStatus;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteWithTradie extends Quote {
  tradie_profile?: {
    full_name: string;
    avatar_url: string | null;
    verification_status: VerificationStatus;
    verified_trades: string[];
    declared_trades: string[];
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

export interface Conversation {
  id: string;
  title: string | null;
  is_group: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_admin: boolean;
  archived_at: string | null;
}

export interface ConversationPermission {
  id: string;
  conversation_id: string;
  user_id: string;
  blocked_by: string;
  can_see_phone: boolean;
  can_see_email: boolean;
  can_see_address: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string | null;
  content: string;
  image_url: string | null;
  is_booking_request: boolean;
  job_id: string | null;
  read_at: string | null;
  deleted_at: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  created_at: string;
}

export interface Notification {
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

export interface CalendarIntegration {
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

export interface ServiceReminder {
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

export interface Review {
  id: string;
  job_id: string | null;
  tradie_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  tradie_id: string;
  client_id: string;
  unlocked_at: string;
  amount_paid: number;
  created_at: string;
}

export interface JobUnlock {
  id: string;
  tradie_id: string;
  job_id: string;
  unlocked_at: string;
  amount_paid: number;
  created_at: string;
}

export interface JobVariation {
  id: string;
  job_id: string;
  description: string;
  additional_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface JobMilestone {
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

export interface MilestoneSubcontractor {
  id: string;
  milestone_id: string;
  business_name: string;
  invoice_number: string | null;
  amount: number;
  invoice_id: string | null;
  created_at: string;
}

export interface Invoice {
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

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  created_at: string;
}

export interface StripeSubscription {
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

export type VacancyRoleType = 'apprentice' | 'qualified' | 'senior_advisory';
export type VacancyStatus = 'open' | 'closed';
export type ApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected';

export interface TradeVacancy {
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
}

export interface VacancyApplication {
  id: string;
  vacancy_id: string;
  applicant_id: string;
  cover_letter: string;
  status: ApplicationStatus;
  created_at: string;
}

export interface PortfolioImage {
  id: string;
  tradie_id: string;
  image_url: string;
  caption: string;
  sort_order: number;
  created_at: string;
}

export interface TradeVacancyWithEmployer extends TradeVacancy {
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

export interface VacancyApplicationWithApplicant extends VacancyApplication {
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

export type PaymentType = 'lead_unlock' | 'job_access' | 'job_funding';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  profile_id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  payment_type: PaymentType;
  job_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface TradeCategory {
  id: string;
  name: string;
  default_reminder_months: number;
  created_at: string;
}

export interface SystemSettings {
  id: number;
  is_training_mode_active: boolean;
  updated_at: string;
}

export interface JobWithRelations extends Job {
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

export interface TradieWithDetails extends Profile {
  tradie_details: TradieDetails | null;
  availability_hours?: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      tradie_details: {
        Row: TradieDetails;
        Insert: Omit<TradieDetails, 'id' | 'created_at'>;
        Update: Partial<Omit<TradieDetails, 'id' | 'created_at'>>;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
      };
      my_trades: {
        Row: MyTrade;
        Insert: Omit<MyTrade, 'id' | 'created_at'>;
        Update: Partial<Omit<MyTrade, 'id' | 'created_at'>>;
      };
      availability_slots: {
        Row: AvailabilitySlot;
        Insert: Omit<AvailabilitySlot, 'id' | 'created_at'>;
        Update: Partial<Omit<AvailabilitySlot, 'id' | 'created_at'>>;
      };
      jobs: {
        Row: Job;
        Insert: Omit<Job, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Job, 'id' | 'created_at'>>;
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Conversation, 'id' | 'created_at' | 'updated_at'>>;
      };
      conversation_participants: {
        Row: ConversationParticipant;
        Insert: Omit<ConversationParticipant, 'id' | 'joined_at'>;
        Update: Partial<Omit<ConversationParticipant, 'id' | 'joined_at'>>;
      };
      conversation_permissions: {
        Row: ConversationPermission;
        Insert: Omit<ConversationPermission, 'id' | 'created_at'>;
        Update: Partial<Omit<ConversationPermission, 'id' | 'created_at'>>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at'>;
        Update: Partial<Omit<Message, 'id' | 'created_at'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      reviews: {
        Row: Review;
        Insert: Omit<Review, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>;
      };
      connections: {
        Row: Connection;
        Insert: Omit<Connection, 'id' | 'created_at'>;
        Update: Partial<Omit<Connection, 'id' | 'created_at'>>;
      };
      job_unlocks: {
        Row: JobUnlock;
        Insert: Omit<JobUnlock, 'id' | 'created_at'>;
        Update: Partial<Omit<JobUnlock, 'id' | 'created_at'>>;
      };
      quotes: {
        Row: Quote;
        Insert: Omit<Quote, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Quote, 'id' | 'created_at' | 'updated_at'>>;
      };
      job_variations: {
        Row: JobVariation;
        Insert: Omit<JobVariation, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<JobVariation, 'id' | 'created_at' | 'updated_at'>>;
      };
      job_milestones: {
        Row: JobMilestone;
        Insert: Omit<JobMilestone, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<JobMilestone, 'id' | 'created_at' | 'updated_at'>>;
      };
      milestone_subcontractors: {
        Row: MilestoneSubcontractor;
        Insert: Omit<MilestoneSubcontractor, 'id' | 'created_at'>;
        Update: Partial<Omit<MilestoneSubcontractor, 'id' | 'created_at'>>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Invoice, 'id' | 'created_at' | 'updated_at'>>;
      };
      invoice_line_items: {
        Row: InvoiceLineItem;
        Insert: Omit<InvoiceLineItem, 'id' | 'created_at'>;
        Update: Partial<Omit<InvoiceLineItem, 'id' | 'created_at'>>;
      };
      calendar_integrations: {
        Row: CalendarIntegration;
        Insert: Omit<CalendarIntegration, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CalendarIntegration, 'id' | 'created_at' | 'updated_at'>>;
      };
      service_reminders: {
        Row: ServiceReminder;
        Insert: Omit<ServiceReminder, 'id' | 'created_at'>;
        Update: Partial<Omit<ServiceReminder, 'id' | 'created_at'>>;
      };
      stripe_subscriptions: {
        Row: StripeSubscription;
        Insert: Omit<StripeSubscription, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<StripeSubscription, 'id' | 'created_at' | 'updated_at'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at'>;
        Update: Partial<Omit<Payment, 'id' | 'created_at'>>;
      };
      onboarding_progress: {
        Row: OnboardingProgress;
        Insert: Omit<OnboardingProgress, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OnboardingProgress, 'id' | 'created_at' | 'updated_at'>>;
      };
      hint_tracking: {
        Row: HintTracking;
        Insert: Omit<HintTracking, 'id' | 'created_at'>;
        Update: Partial<Omit<HintTracking, 'id' | 'created_at'>>;
      };
      trade_categories: {
        Row: TradeCategory;
        Insert: Omit<TradeCategory, 'id' | 'created_at'>;
        Update: Partial<Omit<TradeCategory, 'id' | 'created_at'>>;
      };
      system_settings: {
        Row: SystemSettings;
        Insert: SystemSettings;
        Update: Partial<Omit<SystemSettings, 'id'>>;
      };
      trade_vacancies: {
        Row: TradeVacancy;
        Insert: Omit<TradeVacancy, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<TradeVacancy, 'id' | 'created_at' | 'updated_at'>>;
      };
      vacancy_applications: {
        Row: VacancyApplication;
        Insert: Omit<VacancyApplication, 'id' | 'created_at'>;
        Update: Partial<Omit<VacancyApplication, 'id' | 'created_at'>>;
      };
    };
  };
}
