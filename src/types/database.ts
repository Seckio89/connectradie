import type { Database } from './supabase';

/**
 * Row shape of a table, straight from the GENERATED types (src/types/supabase.ts).
 *
 * The Supabase client is instantiated as `createClient<Database>` with those
 * generated types, so every query RESULT is shaped by them. Deriving the
 * hand-written domain types from `Row<'…'>` is what keeps annotations and
 * results from drifting apart. Regenerate supabase.ts after every migration —
 * never hand-edit it.
 */
type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Insert payload for a table, straight from the GENERATED types. */
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Update payload for a table, straight from the GENERATED types.
 *
 * ANNOTATE EVERY payload variable with this or `Insert<'…'>`. It is the only
 * thing that makes a write payload column-checked: postgrest-js binds the
 * argument of `.update()` to a naked generic, and inference erases object-literal
 * freshness, so an inline literal with an unknown column compiles clean. A
 * variable with an explicit annotation is a plain assignment, so excess-property
 * checking fires — and a later `payload.bogus = 1` fails too, because the
 * property does not exist on the annotated type.
 *
 * `npm run check:columns` covers inline literals; this covers the rest.
 */
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type UserRole = 'client' | 'tradie' | 'admin';
export type SubscriptionTier = 'free' | 'pro' | 'pro_plus' | 'business';
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

/**
 * A profile row — EXACTLY the generated `profiles` Row.
 *
 * Un-narrowed for the same reason as Job: `role`, `verification_status`,
 * `employment_type` and `employer_status` DO each have a matching CHECK
 * constraint, but PostgREST types every text column as `string`, so narrowing
 * any of them would make raw `.from('profiles')` rows non-assignable and force
 * an `as Profile` cast at every read — the exact drift this collapse removes.
 *
 * Note `declared_trades` / `verified_trades` / `license_trades` are genuinely
 * NULLABLE arrays. The old hand-written type claimed `string[]`, so `.map()` on
 * them type-checked while being a live TypeError for any profile that has never
 * had trades set. Call sites now have to guard, and several did not.
 */
export type Profile = Row<'profiles'> & {
  /**
   * NOT columns on `profiles`. These are a home address, so they were moved to
   * the owner-or-admin-only `profile_private` table. AuthContext.fetchProfile
   * embeds them and flattens them back onto the profile object so consumers
   * (QuoteEstimator, Leads) keep reading `profile.base_latitude` unchanged.
   *
   * They are declared here rather than left to the `as Profile` cast in
   * AuthContext, because that cast is what let the columns disappear from the
   * generated types without a single call site failing to compile.
   *
   * Null for any profile fetched WITHOUT that embed — check before using.
   */
  base_latitude?: number | null;
  base_longitude?: number | null;
};

/** A tradie_details row — EXACTLY the generated Row (see the note on Profile). */
export type TradieDetails = Row<'tradie_details'>;

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

/** A tradie's CRM contact — an on- or off-app client they can quote / assign work for. */
export type ClientContact = {
  id: string;
  owner_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  linked_profile_id: string | null;
  // How this client pays. 'external' (default) = manual bank transfer / cash,
  // record-only invoices; 'stripe' = emailed card pay link.
  payment_method: 'stripe' | 'external';
  created_at: string;
  updated_at: string;
}

/** The fee schedule as data (pricing rebuild). Public read; service-role writes only. */
export type PricingTier = {
  id: string; // 'free' | 'pro' | 'pm'
  name: string;
  monthly_price_cents: number;
  annual_monthly_price_cents: number | null;
  rate_bps: number;
  reduced_rate_bps: number;
  reduced_threshold_cents: number;
  fee_cap_cents: number;
  // v2.1 columns (see migration 20260723120000). Not yet read by the live engine;
  // activated at the Phase 3 cutover alongside the labour-only fee model.
  repeat_rate_bps: number;
  cap_floor_bps: number;
  min_fee_cents: number;
  instant_payout_bps: number;
  instant_payout_min_cents: number;
  team_seats: number | null;
  direct_pay_allowed: boolean;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

/**
 * A job row — EXACTLY the generated `jobs` Row, deliberately un-narrowed.
 *
 * `jobs.status`, `priority` and `quoting_status` do each have a CHECK constraint
 * that matches JobStatus / low|normal|high / QuotingStatus (verified against the
 * live DB, not just the migration files). Narrowing them here was tried and
 * reverted: PostgREST types every text column as `string`, so the moment `Job`
 * declares a narrower member, a raw `.from('jobs').select('*')` row stops being
 * assignable to `Job` and every query boundary needs an `as` cast. Casts are the
 * exact failure mode this refactor exists to remove (CLAUDE.md: "no `any`, no
 * assertion-papering"), and a cast would reintroduce the drift silently.
 *
 * So the row type stays honest and the domain unions stay useful at the points
 * where a status is *written* or *compared* — see JobStatus / QuotingStatus,
 * which are still exported and still constrain `.update({ status: … })` payloads
 * via the generated Insert/Update types.
 *
 * `budget_type`, `job_complexity` and `preferred_time_slot` have NO CHECK
 * constraint at all, so BudgetType / JobComplexity are aspirational — validate
 * those at the boundary, never assume them.
 */
export type Job = Row<'jobs'>;

/**
 * A quote row — EXACTLY the generated `quotes` Row.
 *
 * `quotes.status` is NOT NULL and quotes_status_check matches QuoteStatus
 * exactly, and quotes_site_visit_fee_status_check restricts
 * `site_visit_fee_status` to NULL|'paid'|'credited'. Both are still left
 * un-narrowed for the assignability reason documented on Job: narrowing forces
 * an `as` cast at every query boundary, and this is the payment path — a cast
 * here is exactly where silent drift would be most expensive.
 *
 * Collapsing onto the generated Row also picks up columns the hand-written type
 * never had, several of which the app already writes: withdrawn_at,
 * decline_reason, declined_at, labour_cents, materials_cents,
 * materials_description, property_type, trade_category.
 *
 * NOTE `site_visit_time_confirmed` is NOT NULL in the DB; the hand-written type
 * said `boolean | null`.
 */
export type Quote = Row<'quotes'>;

/**
 * A quote enriched with the tradie's public profile, business details and
 * review aggregates — assembled in QuoteComparisonView, not returned by a
 * single query.
 *
 * Every member below mirrors the exact column list its `.select(...)` asks for,
 * with the generated nullability. Previously this claimed `verified_trades` /
 * `declared_trades` were `string[]` and `verification_status` was a
 * VerificationStatus; all three are nullable text/array columns, so the old
 * shape was wrong in a way `.map()`/`.length` call sites could have tripped on.
 * The three keys are required-and-nullable because the builder always assigns
 * them (`profileData || null`).
 */
export type QuoteWithTradie = Quote & {
  tradie_profile: {
    full_name: string;
    avatar_url: string | null;
    verification_status: string | null;
    verified_trades: string[] | null;
    declared_trades: string[] | null;
    is_gst_registered: boolean;
    /** Gates the "verified" ProBadge on quote cards. */
    is_identity_verified: boolean | null;
    /** When the tradie joined the platform — used for the "Member since YYYY"
     *  retention signal on quote cards. */
    created_at: string;
  } | null;
  tradie_details: {
    business_name: string;
    trade_category: string;
    is_verified: boolean | null;
    is_insured: boolean | null;
    subscription_tier: string | null;
  } | null;
  review_stats: {
    avg_rating: number;
    total_reviews: number;
    total_jobs_completed: number;
  } | null;
}

export type Conversation = Row<'conversations'>;

export type ConversationParticipant = Row<'conversation_participants'>;

export type ConversationPermission = Row<'conversation_permissions'>;

export type Message = Row<'messages'>;

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

export type VacancyRoleType = 'apprentice' | 'qualified' | 'senior_advisory' | 'non_trade';
export type VacancyStatus = 'open' | 'closed' | 'draft';
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
/**
 * Row shape of the `public_vacancies` VIEW — the safe columns for the public
 * /careers pages.
 *
 * NOT collapsed onto Row<'public_vacancies'>. Postgres cannot prove NOT NULL
 * through a view, so the generated Row types every column as nullable —
 * including `id`, `title` and `role_type`, which the underlying
 * `trade_vacancies` columns declare NOT NULL. Adopting that would force ~75
 * null-guards across the /careers pages to model a state the base table forbids.
 * Kept hand-written and matched to the base table's real nullability; re-check
 * this if the view's column list changes.
 */
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

export type PortfolioImage = Row<'portfolio_images'>;

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

export type AccountRemoval = {
  id: string;
  user_id: string;
  reason: string | null;
  requested_at: string;
  processed_at: string | null;
  status: 'pending' | 'processed' | 'reinstated';
  reinstated_at: string | null;
}

export type QuoteTemplate = {
  id: string;
  tradie_id: string;
  name: string;
  message: string | null;
  default_duration: string | null;
  includes_materials: boolean;
  // Enriched fields for the off-app NewQuoteModal "save as template" flow.
  title: string | null;
  scope: string | null;
  internal_notes: string | null;
  price: number | null;
  property_type: string | null;
  trade_category: string | null;
  conditions: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientSite = {
  id: string;
  client_contact_id: string;
  site_name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  access_instructions: string | null;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type CustomTaskSuggestion = {
  id: string;
  submitted_by: string | null;
  task_name: string;
  task_name_normalized: string;
  trade_context: string | null;
  times_submitted: number;
  status: 'pending' | 'approved' | 'rejected';
  approved_as_category: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  alert_enabled: boolean;
  last_alerted_at: string | null;
  created_at: string;
}

export type AbuseReportType = 'spam' | 'fake_review' | 'harassment' | 'contact_scraping' | 'other';
export type AbuseReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AbuseReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

/**
 * An abuse_reports row — EXACTLY the generated Row.
 *
 * abuse_reports_status_check allows 'warned' in addition to the four values
 * AbuseReportStatus lists, so the union below is INCOMPLETE — another reason
 * not to narrow the column here.
 */
export type AbuseReport = Row<'abuse_reports'>;

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

/**
 * A job plus its embedded joins, as returned by
 *   .select('*, profiles!jobs_client_id_fkey(full_name, email, phone), projects(id, title)')
 *
 * The joined keys are REQUIRED and nullable, not optional — PostgREST always
 * emits the key, and it is `null` when the FK is null (client_id and project_id
 * are both nullable). Declaring them optional made `profiles` vanish from the
 * type under `exactOptionalPropertyTypes`-style narrowing, which is what broke
 * Leads.tsx and TradieDashboard.tsx.
 */
export type JobWithRelations = Job & {
  profiles: {
    full_name: string;
    email: string;
    phone: string | null;
  } | null;
  projects: {
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

export type ServiceAgreement = Row<'service_agreements'>;

export type ServiceVisit = Row<'service_visits'>;

export type ServiceInvoice = Row<'service_invoices'>;

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
