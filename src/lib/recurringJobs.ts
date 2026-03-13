import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecurringJobData {
  client_id?: string;
  tradie_id?: string | null;
  trade_category: string;
  description: string;
  frequency_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active?: boolean;
  original_job_id?: string;
  location?: string;
  agreed_price?: number;
  day_of_week?: number;
  preferred_time?: string;
  billing_cycle?: 'fortnightly' | 'monthly';
}

export interface RecurringJob {
  id: string;
  client_id: string;
  tradie_id: string;
  trade_category: string;
  description: string;
  frequency_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active: boolean;
  original_job_id: string | null;
  times_completed: number;
  created_at: string;
  updated_at: string;
  location?: string;
  agreed_price?: number;
  day_of_week?: number;
  preferred_time?: string;
  billing_cycle?: 'fortnightly' | 'monthly';
  last_invoiced_at?: string;
  tradie?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export type RecurringSessionStatus = 'scheduled' | 'completed' | 'rescheduled' | 'skipped' | 'extra';

export interface RecurringSession {
  id: string;
  recurring_job_id: string;
  scheduled_date: string;
  actual_date: string | null;
  status: RecurringSessionStatus;
  extra_hours: number | null;
  extra_cost: number | null;
  reschedule_reason: string | null;
  reschedule_by: 'client' | 'tradie' | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringJobSuggestion {
  tradeCategory: string;
  frequencyMonths: number;
  label: string;
  description: string;
  priceRange?: { min: number; max: number; unit: string };
}

export interface DueReminder {
  id: string;
  trade_category: string;
  description: string;
  next_due_date: string;
  reminder_days_before: number;
  tradie_name: string;
  tradie_id: string;
  days_until_due: number;
}

// ---------------------------------------------------------------------------
// Default frequencies (months) by trade category
// ---------------------------------------------------------------------------

// Frequency conventions: positive = months, -1 = weekly (7 days), -2 = fortnightly (14 days)
export const FREQ_WEEKLY = -1;
export const FREQ_FORTNIGHTLY = -2;

export const DEFAULT_FREQUENCIES: Record<string, number> = {
  // Weekly services
  cleaning_weekly: FREQ_WEEKLY,
  regular_house_clean: FREQ_WEEKLY,
  lawn_mowing_weekly: FREQ_WEEKLY,
  regular_mowing: FREQ_WEEKLY,
  pool_maintenance_weekly: FREQ_WEEKLY,
  chemical_balancing: FREQ_WEEKLY,
  // Fortnightly services
  cleaning_fortnightly: FREQ_FORTNIGHTLY,
  lawn_mowing_fortnightly: FREQ_FORTNIGHTLY,
  garden_maintenance_fortnightly: FREQ_FORTNIGHTLY,
  hedge_trimming: FREQ_FORTNIGHTLY,
  mulching_and_weeding: FREQ_FORTNIGHTLY,
  garden_tidy_up: FREQ_FORTNIGHTLY,
  // Monthly services
  cleaning: 1,
  office_clean: 1,
  commercial_clean: 1,
  strata_common_areas: 1,
  lawn_mowing: 1,
  property_maintenance: 1,
  filter_and_pump_service: 1,
  filter_replacement: 1,
  filter_clean_and_gas_top_up: 1,
  regular_aircon_service: 3,
  regular_hvac_service: 3,
  // Quarterly services
  landscaping: 3,
  pool_maintenance: 3,
  garden_maintenance: 3,
  oven_and_bbq_clean: 3,
  regular_tree_maintenance: 3,
  // Biannual services
  gutter_cleaning: 6,
  window_cleaning: 6,
  carpet_cleaning: 6,
  roof_inspection: 6,
  dryer_vent_clean: 6,
  floor_polishing_and_reseal: 6,
  // Annual services
  plumbing: 12,
  backflow_testing: 12,
  septic_pump_out: 12,
  pest_control: 12,
  general_pest_treatment: 12,
  hvac: 12,
  air_conditioning: 12,
  solar: 12,
  panel_cleaning_and_inspection: 12,
  fire_safety: 12,
  smoke_alarm_testing: 12,
  fire_extinguisher_service: 12,
  exit_light_inspection: 12,
  hot_water_service: 12,
  system_flush: 12,
  anode_rod_check: 12,
  septic_tank: 12,
  chimney_sweep: 12,
  chimney_clean: 12,
  garage_doors: 12,
  annual_service: 12,
  security_systems: 12,
  annual_alarm_testing: 12,
  appliance_service: 12,
  safety_inspection: 12,
  rcd_testing: 12,
  concrete_sealing: 12,
  fence_staining: 12,
  grout_and_reseal: 12,
  membrane_inspection: 12,
  // Biennial services
  electrical: 24,
  roofing: 24,
  waterproofing: 24,
  tree_lopping: 24,
  termite_inspection: 24,
  termite_barrier: 24,
  timber_maintenance: 24,
  touch_up_service: 24,
  // 3-year services
  carpentry: 36,
  fencing: 36,
  concreting: 36,
  tiling: 36,
  // 5-year services
  painting: 60,
  rendering: 60,
} as const;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the next due date by adding frequency months to the last
 * completed date.
 */
export function calculateNextDueDate(
  lastCompleted: Date | string,
  frequencyMonths: number,
): Date {
  const base = typeof lastCompleted === 'string' ? new Date(lastCompleted) : lastCompleted;
  const next = new Date(base);
  if (frequencyMonths === FREQ_WEEKLY) {
    next.setDate(next.getDate() + 7);
  } else if (frequencyMonths === FREQ_FORTNIGHTLY) {
    next.setDate(next.getDate() + 14);
  } else if (frequencyMonths > 0) {
    next.setMonth(next.getMonth() + frequencyMonths);
  }
  return next;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new recurring job.
 */
export async function createRecurringJob(
  data: RecurringJobData,
): Promise<RecurringJob> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: created, error } = await supabase
    .from('recurring_jobs')
    .insert({
      client_id: data.client_id ?? user.id,
      tradie_id: data.tradie_id || null,
      trade_category: data.trade_category,
      description: data.description,
      frequency_months: data.frequency_months,
      next_due_date: data.next_due_date,
      reminder_days_before: data.reminder_days_before,
      is_active: data.is_active ?? true,
      original_job_id: data.original_job_id ?? null,
      times_completed: 0,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return created as unknown as RecurringJob;
}

/**
 * Fetch all recurring jobs for a user, including tradie info.
 */
export async function getRecurringJobs(userId?: string): Promise<RecurringJob[]> {
  let uid = userId;

  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }

  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      *,
      tradie:profiles!recurring_jobs_tradie_id_fkey(id, full_name, email)
    `)
    .eq('client_id', uid)
    .order('next_due_date', { ascending: true });

  if (error) throw new Error(error.message);

  return (data as unknown as RecurringJob[]) ?? [];
}

/**
 * Update fields on a recurring job.
 */
export async function updateRecurringJob(
  id: string,
  data: Partial<RecurringJobData>,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};

  if (data.trade_category !== undefined) updatePayload.trade_category = data.trade_category;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.frequency_months !== undefined) updatePayload.frequency_months = data.frequency_months;
  if (data.next_due_date !== undefined) updatePayload.next_due_date = data.next_due_date;
  if (data.reminder_days_before !== undefined) updatePayload.reminder_days_before = data.reminder_days_before;
  if (data.tradie_id !== undefined) updatePayload.tradie_id = data.tradie_id;
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;
  if (data.location !== undefined) updatePayload.location = data.location;

  const { error } = await supabase
    .from('recurring_jobs')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Cancel (deactivate) a recurring job.
 */
export async function cancelRecurringJob(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_jobs')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Mark a recurring job as completed for the current cycle.
 * Increments times_completed and advances the next_due_date.
 */
export async function markRecurringJobCompleted(id: string): Promise<void> {
  const { data: job, error: fetchError } = await supabase
    .from('recurring_jobs')
    .select('times_completed, frequency_months, next_due_date')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!job) throw new Error('Recurring job not found');

  const nextDue = calculateNextDueDate(new Date(), job.frequency_months);

  const { error } = await supabase
    .from('recurring_jobs')
    .update({
      times_completed: (job.times_completed ?? 0) + 1,
      next_due_date: nextDue.toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Get recurring jobs that are due soon (within their reminder window).
 */
export async function getDueReminders(userId?: string): Promise<DueReminder[]> {
  let uid = userId;

  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }

  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      id,
      trade_category,
      description,
      next_due_date,
      reminder_days_before,
      tradie_id,
      tradie:profiles!recurring_jobs_tradie_id_fkey(full_name)
    `)
    .eq('client_id', uid)
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  if (!data) return [];

  const now = new Date();
  const reminders: DueReminder[] = [];

  interface DueReminderRow {
    id: string;
    trade_category: string;
    description: string;
    next_due_date: string;
    reminder_days_before: number;
    tradie_id: string;
    tradie: { full_name: string } | null;
  }

  for (const job of data as unknown as DueReminderRow[]) {
    const dueDate = new Date(job.next_due_date);
    const diffMs = dueDate.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilDue >= 0 && daysUntilDue <= job.reminder_days_before) {
      reminders.push({
        id: job.id,
        trade_category: job.trade_category,
        description: job.description,
        next_due_date: job.next_due_date,
        reminder_days_before: job.reminder_days_before,
        tradie_name: job.tradie?.full_name ?? 'Unknown',
        tradie_id: job.tradie_id,
        days_until_due: daysUntilDue,
      });
    }
  }

  return reminders.sort((a, b) => a.days_until_due - b.days_until_due);
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * Suggest recurring job settings based on the trade category.
 */
export function suggestRecurringJob(tradeCategory: string): RecurringJobSuggestion {
  const key = tradeCategory.toLowerCase().replace(/\s+/g, '_');
  const frequencyMonths = DEFAULT_FREQUENCIES[key] ?? 12;

  const labels: Record<string, string> = {
    // Weekly
    cleaning_weekly: 'Weekly house cleaning',
    regular_house_clean: 'Weekly house cleaning',
    lawn_mowing_weekly: 'Weekly lawn mowing',
    regular_mowing: 'Weekly lawn mowing',
    pool_maintenance_weekly: 'Weekly pool service',
    chemical_balancing: 'Weekly pool chemical balance',
    // Fortnightly
    cleaning_fortnightly: 'Fortnightly house cleaning',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing',
    garden_maintenance_fortnightly: 'Fortnightly garden care',
    hedge_trimming: 'Fortnightly hedge trimming',
    mulching_and_weeding: 'Fortnightly mulching & weeding',
    garden_tidy_up: 'Fortnightly garden tidy-up',
    // Monthly
    cleaning: 'Monthly cleaning service',
    office_clean: 'Monthly office clean',
    commercial_clean: 'Monthly commercial clean',
    strata_common_areas: 'Monthly strata common area clean',
    lawn_mowing: 'Monthly lawn mowing',
    property_maintenance: 'Monthly property maintenance',
    filter_and_pump_service: 'Monthly pool filter & pump service',
    filter_replacement: 'Monthly HVAC filter replacement',
    filter_clean_and_gas_top_up: 'Monthly aircon filter clean & gas top-up',
    // Quarterly
    regular_aircon_service: 'Quarterly aircon service',
    regular_hvac_service: 'Quarterly HVAC service',
    landscaping: 'Quarterly garden maintenance',
    pool_maintenance: 'Quarterly pool service',
    garden_maintenance: 'Quarterly garden care',
    oven_and_bbq_clean: 'Quarterly oven & BBQ clean',
    regular_tree_maintenance: 'Quarterly tree maintenance',
    // Biannual
    gutter_cleaning: 'Biannual gutter clean',
    window_cleaning: 'Biannual window clean',
    carpet_cleaning: 'Biannual carpet steam clean',
    roof_inspection: 'Biannual roof inspection',
    dryer_vent_clean: 'Biannual dryer vent clean',
    floor_polishing_and_reseal: 'Biannual floor polishing & reseal',
    // Annual
    plumbing: 'Annual plumbing inspection',
    backflow_testing: 'Annual backflow testing',
    septic_pump_out: 'Annual septic pump-out',
    pest_control: 'Annual pest treatment',
    general_pest_treatment: 'Annual general pest treatment',
    hvac: 'Annual HVAC service',
    air_conditioning: 'Annual aircon service',
    solar: 'Annual solar panel inspection',
    panel_cleaning_and_inspection: 'Annual solar panel cleaning & inspection',
    fire_safety: 'Annual fire safety check',
    smoke_alarm_testing: 'Annual smoke alarm testing',
    fire_extinguisher_service: 'Annual fire extinguisher service',
    exit_light_inspection: 'Annual exit light inspection',
    hot_water_service: 'Annual hot water service',
    system_flush: 'Annual hot water system flush',
    anode_rod_check: 'Annual anode rod check',
    septic_tank: 'Annual septic pump-out',
    chimney_sweep: 'Annual chimney sweep',
    chimney_clean: 'Annual chimney clean',
    garage_doors: 'Annual garage door service',
    annual_service: 'Annual garage door service',
    security_systems: 'Annual security system check',
    annual_alarm_testing: 'Annual alarm system testing',
    appliance_service: 'Annual appliance service',
    safety_inspection: 'Annual electrical safety inspection',
    rcd_testing: 'Annual RCD testing',
    concrete_sealing: 'Annual concrete sealing',
    fence_staining: 'Annual fence staining',
    grout_and_reseal: 'Annual grout & reseal',
    membrane_inspection: 'Annual membrane inspection',
    // Biennial
    electrical: 'Biennial electrical safety check',
    roofing: 'Biennial roof inspection',
    waterproofing: 'Biennial waterproofing check',
    tree_lopping: 'Biennial tree lopping',
    termite_inspection: 'Biennial termite inspection',
    termite_barrier: 'Biennial termite barrier treatment',
    timber_maintenance: 'Biennial timber maintenance',
    touch_up_service: 'Biennial paint touch-up service',
    // 3-year
    carpentry: 'Timber maintenance (every 3 years)',
    fencing: 'Fence inspection (every 3 years)',
    concreting: 'Concrete sealing (every 3 years)',
    tiling: 'Tile & grout reseal (every 3 years)',
    // 5-year
    painting: 'Repaint (every 5 years)',
    rendering: 'Render refresh (every 5 years)',
  };

  const descriptions: Record<string, string> = {
    cleaning_weekly: 'Weekly home clean: kitchen, bathrooms, vacuuming, mopping, and dusting.',
    regular_house_clean: 'Weekly home clean: kitchen, bathrooms, vacuuming, mopping, and dusting.',
    lawn_mowing_weekly: 'Weekly lawn mowing, edging, and blowing.',
    regular_mowing: 'Weekly lawn mowing, edging, and blowing.',
    pool_maintenance_weekly: 'Weekly pool chemical balance, skim, brush, and filter basket clean.',
    chemical_balancing: 'Weekly pool chemical balance, water testing, and skim.',
    cleaning_fortnightly: 'Fortnightly deep clean: kitchens, bathrooms, floors, and surfaces.',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing, edging, and garden tidy.',
    garden_maintenance_fortnightly: 'Fortnightly weeding, pruning, and garden bed maintenance.',
    hedge_trimming: 'Fortnightly hedge trimming and shaping to keep your garden neat.',
    mulching_and_weeding: 'Fortnightly weeding, mulching, and garden bed maintenance.',
    garden_tidy_up: 'Fortnightly garden tidy: raking, pruning, blowing, and green waste removal.',
    cleaning: 'Thorough home cleaning including kitchens, bathrooms, and living areas.',
    office_clean: 'Monthly office clean: desks, floors, kitchenette, and bathrooms.',
    commercial_clean: 'Monthly commercial premises clean: floors, surfaces, and amenities.',
    strata_common_areas: 'Monthly strata common area clean: lobbies, stairwells, and car parks.',
    lawn_mowing: 'Regular lawn mowing, edging, and blowing to keep your yard neat.',
    property_maintenance: 'Monthly general property maintenance: repairs, checks, and upkeep.',
    filter_and_pump_service: 'Monthly pool filter clean, pump check, and pressure test.',
    filter_replacement: 'Monthly HVAC filter replacement and basic system check.',
    filter_clean_and_gas_top_up: 'Monthly aircon filter clean and gas level check.',
    regular_aircon_service: 'Quarterly aircon service: filter clean, gas top-up, and performance check.',
    regular_hvac_service: 'Quarterly HVAC service: filter change, duct inspection, and performance check.',
    landscaping: 'Seasonal garden maintenance including pruning, mulching, and planting.',
    pool_maintenance: 'Pool chemical balance, filter clean, pump check, and water testing.',
    garden_maintenance: 'Garden bed weeding, pruning, mulching, and seasonal planting.',
    oven_and_bbq_clean: 'Professional oven and BBQ deep clean and degrease.',
    regular_tree_maintenance: 'Quarterly tree pruning, dead branch removal, and canopy thinning.',
    gutter_cleaning: 'Clear gutters and downpipes of leaves and debris to prevent water damage.',
    window_cleaning: 'Interior and exterior window cleaning for all accessible windows.',
    carpet_cleaning: 'Professional carpet steam cleaning to remove dirt, stains, and allergens.',
    roof_inspection: 'Biannual roof check for leaks, loose tiles, and gutter condition.',
    dryer_vent_clean: 'Dryer vent and duct clean to prevent lint build-up and fire risk.',
    floor_polishing_and_reseal: 'Timber or polished concrete floor buff, polish, and reseal.',
    plumbing: 'Plumbing inspection: check pipes, taps, toilet mechanisms, and hot water system.',
    backflow_testing: 'Annual backflow prevention device testing as required by council.',
    septic_pump_out: 'Septic tank pump-out and system inspection.',
    pest_control: 'Comprehensive pest treatment for spiders, ants, cockroaches, and termites.',
    general_pest_treatment: 'General pest spray: spiders, ants, cockroaches, and silverfish.',
    hvac: 'Air conditioning and heating system service and filter replacement.',
    air_conditioning: 'Split system or ducted aircon service, gas top-up, and filter clean.',
    solar: 'Solar panel cleaning, inverter check, and performance inspection.',
    panel_cleaning_and_inspection: 'Solar panel wash, inverter check, and output performance report.',
    fire_safety: 'Smoke alarm testing, fire extinguisher check, and exit light inspection.',
    smoke_alarm_testing: 'Test and replace batteries in all smoke alarms to meet AS 3786.',
    fire_extinguisher_service: 'Fire extinguisher pressure test, tag, and replace if expired.',
    exit_light_inspection: 'Emergency and exit light function test and battery check.',
    hot_water_service: 'Hot water system flush, anode rod check, and temperature/pressure relief valve test.',
    system_flush: 'Hot water system flush to remove sediment and maintain efficiency.',
    anode_rod_check: 'Anode rod inspection and replacement to extend tank life.',
    septic_tank: 'Septic tank pump-out and system inspection.',
    chimney_sweep: 'Chimney and flue cleaning to prevent fire hazards and improve airflow.',
    chimney_clean: 'Full chimney sweep: creosote removal, flue inspection, and cowl check.',
    garage_doors: 'Garage door service: spring tension, track alignment, and motor check.',
    annual_service: 'Annual garage door service: lubrication, spring tension, and safety sensor check.',
    security_systems: 'Security alarm testing, camera check, and sensor calibration.',
    annual_alarm_testing: 'Annual security alarm and sensor test with monitoring station check-in.',
    appliance_service: 'Service and clean major appliances (oven, dishwasher, dryer).',
    safety_inspection: 'Electrical safety inspection: switchboard, wiring, and compliance check.',
    rcd_testing: 'Residual current device testing to ensure electrical safety compliance.',
    concrete_sealing: 'Concrete driveway and path sealing to prevent cracking and staining.',
    fence_staining: 'Timber fence stain and seal to protect from weather and UV damage.',
    grout_and_reseal: 'Re-grout and reseal bathroom and kitchen tiles to prevent water damage.',
    membrane_inspection: 'Waterproof membrane inspection in wet areas and balconies.',
    electrical: 'Electrical safety inspection including switchboard, smoke alarms, and RCD testing.',
    roofing: 'Roof inspection for leaks, damaged tiles, ridge capping, and gutter condition.',
    waterproofing: 'Check waterproof membranes in wet areas, balconies, and below-grade walls.',
    tree_lopping: 'Tree pruning, dead limb removal, and canopy shaping.',
    termite_inspection: 'Full termite inspection with thermal imaging and moisture detection.',
    termite_barrier: 'Termite barrier re-treatment and perimeter inspection.',
    timber_maintenance: 'Deck and timber structure oiling, sanding, and repair.',
    touch_up_service: 'Interior/exterior paint touch-up: scuffs, chips, and wear areas.',
    carpentry: 'Inspection and maintenance of timber structures, decks, and fences.',
    fencing: 'Fence inspection: check posts, rails, and palings. Repair or stain as needed.',
    concreting: 'Concrete driveway and path sealing to prevent cracking and staining.',
    tiling: 'Re-grout and reseal bathroom and kitchen tiles to prevent water damage.',
    painting: 'Full interior/exterior repaint to maintain your property.',
    rendering: 'Inspect and patch render, apply fresh paint or sealant coat.',
  };

  // Typical Australian pricing ranges per service visit
  const pricing: Record<string, { min: number; max: number; unit: string }> = {
    cleaning_weekly: { min: 80, max: 180, unit: 'per visit' },
    regular_house_clean: { min: 80, max: 180, unit: 'per visit' },
    cleaning_fortnightly: { min: 100, max: 220, unit: 'per visit' },
    cleaning: { min: 120, max: 300, unit: 'per visit' },
    office_clean: { min: 150, max: 400, unit: 'per visit' },
    commercial_clean: { min: 200, max: 600, unit: 'per visit' },
    strata_common_areas: { min: 200, max: 500, unit: 'per visit' },
    oven_and_bbq_clean: { min: 100, max: 250, unit: 'per visit' },
    lawn_mowing_weekly: { min: 40, max: 80, unit: 'per visit' },
    regular_mowing: { min: 40, max: 80, unit: 'per visit' },
    lawn_mowing_fortnightly: { min: 50, max: 100, unit: 'per visit' },
    lawn_mowing: { min: 50, max: 120, unit: 'per visit' },
    hedge_trimming: { min: 60, max: 150, unit: 'per visit' },
    garden_tidy_up: { min: 60, max: 150, unit: 'per visit' },
    pool_maintenance_weekly: { min: 60, max: 120, unit: 'per visit' },
    chemical_balancing: { min: 60, max: 120, unit: 'per visit' },
    filter_and_pump_service: { min: 80, max: 180, unit: 'per visit' },
    pool_maintenance: { min: 150, max: 350, unit: 'per visit' },
    garden_maintenance_fortnightly: { min: 80, max: 160, unit: 'per visit' },
    garden_maintenance: { min: 150, max: 400, unit: 'per visit' },
    regular_tree_maintenance: { min: 200, max: 500, unit: 'per visit' },
    landscaping: { min: 200, max: 600, unit: 'per visit' },
    property_maintenance: { min: 100, max: 300, unit: 'per visit' },
    gutter_cleaning: { min: 150, max: 350, unit: 'per visit' },
    window_cleaning: { min: 150, max: 400, unit: 'per visit' },
    carpet_cleaning: { min: 120, max: 350, unit: 'per visit' },
    roof_inspection: { min: 150, max: 350, unit: 'per visit' },
    dryer_vent_clean: { min: 80, max: 180, unit: 'per visit' },
    floor_polishing_and_reseal: { min: 300, max: 800, unit: 'per visit' },
    plumbing: { min: 150, max: 350, unit: 'per visit' },
    backflow_testing: { min: 100, max: 200, unit: 'per visit' },
    septic_pump_out: { min: 300, max: 600, unit: 'per visit' },
    pest_control: { min: 150, max: 400, unit: 'per visit' },
    general_pest_treatment: { min: 150, max: 350, unit: 'per visit' },
    termite_barrier: { min: 1500, max: 4000, unit: 'per treatment' },
    hvac: { min: 120, max: 300, unit: 'per visit' },
    regular_hvac_service: { min: 120, max: 300, unit: 'per visit' },
    filter_replacement: { min: 50, max: 120, unit: 'per visit' },
    air_conditioning: { min: 100, max: 250, unit: 'per visit' },
    regular_aircon_service: { min: 100, max: 250, unit: 'per visit' },
    filter_clean_and_gas_top_up: { min: 80, max: 180, unit: 'per visit' },
    electrical: { min: 200, max: 450, unit: 'per visit' },
    safety_inspection: { min: 200, max: 450, unit: 'per visit' },
    rcd_testing: { min: 100, max: 200, unit: 'per visit' },
    smoke_alarm_testing: { min: 80, max: 150, unit: 'per visit' },
    fire_extinguisher_service: { min: 50, max: 120, unit: 'per unit' },
    exit_light_inspection: { min: 80, max: 200, unit: 'per visit' },
    roofing: { min: 200, max: 500, unit: 'per visit' },
    painting: { min: 2000, max: 8000, unit: 'per job' },
    touch_up_service: { min: 200, max: 600, unit: 'per visit' },
    solar: { min: 150, max: 350, unit: 'per visit' },
    panel_cleaning_and_inspection: { min: 150, max: 350, unit: 'per visit' },
    tree_lopping: { min: 300, max: 1500, unit: 'per visit' },
    termite_inspection: { min: 200, max: 400, unit: 'per visit' },
    fencing: { min: 100, max: 300, unit: 'per visit' },
    fence_staining: { min: 200, max: 500, unit: 'per visit' },
    concreting: { min: 200, max: 500, unit: 'per visit' },
    concrete_sealing: { min: 200, max: 500, unit: 'per visit' },
    tiling: { min: 200, max: 500, unit: 'per visit' },
    grout_and_reseal: { min: 200, max: 500, unit: 'per visit' },
    hot_water_service: { min: 150, max: 300, unit: 'per visit' },
    system_flush: { min: 100, max: 200, unit: 'per visit' },
    anode_rod_check: { min: 100, max: 250, unit: 'per visit' },
    chimney_sweep: { min: 150, max: 300, unit: 'per visit' },
    chimney_clean: { min: 150, max: 300, unit: 'per visit' },
    garage_doors: { min: 100, max: 250, unit: 'per visit' },
    annual_service: { min: 100, max: 250, unit: 'per visit' },
    security_systems: { min: 100, max: 250, unit: 'per visit' },
    annual_alarm_testing: { min: 100, max: 250, unit: 'per visit' },
    appliance_service: { min: 120, max: 300, unit: 'per visit' },
    waterproofing: { min: 200, max: 500, unit: 'per visit' },
    membrane_inspection: { min: 150, max: 350, unit: 'per visit' },
    timber_maintenance: { min: 200, max: 600, unit: 'per visit' },
    carpentry: { min: 200, max: 600, unit: 'per visit' },
  };

  return {
    tradeCategory,
    frequencyMonths,
    label: labels[key] ?? `Regular ${tradeCategory} service`,
    description: descriptions[key] ?? `Recurring ${tradeCategory} maintenance service.`,
    priceRange: pricing[key],
  };
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Fetch upcoming sessions for a recurring job (next 3 months).
 */
export async function getUpcomingSessions(
  recurringJobId: string,
): Promise<RecurringSession[]> {
  const now = new Date();
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select('*')
    .eq('recurring_job_id', recurringJobId)
    .gte('scheduled_date', now.toISOString().split('T')[0])
    .lte('scheduled_date', threeMonthsLater.toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RecurringSession[];
}

/**
 * Reschedule a session to a new date.
 */
export async function rescheduleSession(
  sessionId: string,
  newDate: string,
  reason: string,
  by: 'client' | 'tradie',
): Promise<void> {
  // Fetch session + job to find the other party
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      actual_date: newDate,
      status: 'rescheduled',
      reschedule_reason: reason,
      reschedule_by: by,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Notify the other party
  if (session?.recurring_job) {
    const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string };
    const recipientId = by === 'client' ? job.tradie_id : job.client_id;
    if (recipientId) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      const byLabel = by === 'client' ? 'homeowner' : 'tradie';
      try {
        await insertNotification(
          recipientId,
          'session_rescheduled',
          `Your ${tradeLabel} session has been rescheduled to ${dateLabel} by the ${byLabel}. Reason: ${reason}`,
          { session_id: sessionId, recurring_job_id: session.recurring_job_id, new_date: newDate },
        );
      } catch {
        // Non-critical — session was rescheduled, notification is best-effort
      }
    }
  }
}

/**
 * Skip a session with a reason.
 */
export async function skipSession(
  sessionId: string,
  reason: string,
  by: 'client' | 'tradie',
): Promise<void> {
  // Fetch session + job to find the other party
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      status: 'skipped',
      reschedule_reason: reason,
      reschedule_by: by,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Notify the other party
  if (session?.recurring_job) {
    const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string };
    const recipientId = by === 'client' ? job.tradie_id : job.client_id;
    if (recipientId) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const dateLabel = session.scheduled_date
        ? new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
        : 'upcoming';
      const byLabel = by === 'client' ? 'homeowner' : 'tradie';
      try {
        await insertNotification(
          recipientId,
          'session_skipped',
          `Your ${tradeLabel} session on ${dateLabel} has been skipped by the ${byLabel}. Reason: ${reason}`,
          { session_id: sessionId, recurring_job_id: session.recurring_job_id, scheduled_date: session.scheduled_date },
        );
      } catch {
        // Non-critical
      }
    }
  }
}

/**
 * Add an extra session (outside normal schedule).
 */
export async function addExtraSession(
  recurringJobId: string,
  date: string,
  extraHours: number,
  extraCost: number,
  notes: string,
  tradieId?: string,
): Promise<RecurringSession> {
  const { data, error } = await supabase
    .from('recurring_sessions')
    .insert({
      recurring_job_id: recurringJobId,
      scheduled_date: date,
      status: 'extra',
      extra_hours: extraHours,
      extra_cost: extraCost,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Block the time slot in tradie_availability if tradieId provided
  if (tradieId) {
    try {
      const { blockTimeSlot } = await import('./availability');
      await blockTimeSlot(tradieId, date, '07:00:00', '17:00:00', `Extra session: ${notes || 'Additional work'}`, data.id);
    } catch {
      // Non-critical — session was created, availability block is best-effort
    }
  }

  // Notify the homeowner about the extra session
  try {
    const { data: job } = await supabase
      .from('recurring_jobs')
      .select('client_id, trade_category')
      .eq('id', recurringJobId)
      .maybeSingle();

    if (job?.client_id) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      const costLabel = extraCost > 0 ? ` ($${extraCost.toFixed(2)})` : '';
      await insertNotification(
        job.client_id,
        'extra_session_added',
        `An extra ${tradeLabel} session${costLabel} has been added for ${dateLabel}.${notes ? ` Notes: ${notes}` : ''}`,
        { session_id: data.id, recurring_job_id: recurringJobId, date, extra_cost: extraCost },
      );
    }
  } catch {
    // Non-critical
  }

  return data as RecurringSession;
}

/**
 * Cancel an extra session — sets status to 'skipped' and unblocks the time slot.
 */
export async function cancelExtraSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'skipped' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Unblock the time slot (source_job_id was set to session id)
  try {
    const { unblockTimeSlot } = await import('./availability');
    await unblockTimeSlot(sessionId);
  } catch {
    // Non-critical
  }
}

/**
 * Mark a session as completed.
 */
export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

/**
 * Accept a reschedule proposal — sets actual_date as confirmed.
 */
export async function acceptReschedule(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'scheduled' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

/**
 * Fetch upcoming sessions assigned to a tradie (across all recurring jobs).
 */
export async function getTradieUpcomingSessions(
  tradieId: string,
  limit = 5,
): Promise<(RecurringSession & { recurring_job?: { trade_category: string; description: string; client_id: string; preferred_time: string | null } })[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select(`
      *,
      recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
        trade_category,
        description,
        client_id,
        preferred_time,
        tradie_id
      )
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .limit(limit * 3); // fetch extra, filter client-side

  if (error) throw new Error(error.message);

  // Filter to only sessions where the recurring job's tradie matches
  const filtered = (data ?? []).filter((row: Record<string, unknown>) => {
    const job = row.recurring_job as { tradie_id?: string } | null;
    return job?.tradie_id === tradieId;
  });

  return filtered.slice(0, limit) as (RecurringSession & { recurring_job?: { trade_category: string; description: string; client_id: string; preferred_time: string | null } })[];
}

/**
 * Insert a notification for a user (e.g., reschedule proposal).
 */
export async function insertNotification(
  userId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      message,
      metadata: metadata ?? {},
      read: false,
    });

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Invoice preview
// ---------------------------------------------------------------------------

export interface InvoicePreview {
  regularSessions: RecurringSession[];
  extraSessions: RecurringSession[];
  skippedSessions: RecurringSession[];
  subtotal: number;
  extrasTotal: number;
  total: number;
  billingCycle: string;
}

/**
 * Build an invoice preview for a billing period.
 */
export async function getInvoicePreview(
  recurringJobId: string,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): Promise<InvoicePreview> {
  // Fetch the recurring job for agreed_price and billing_cycle
  const { data: job, error: jobError } = await supabase
    .from('recurring_jobs')
    .select('agreed_price, billing_cycle')
    .eq('id', recurringJobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);

  const agreedPrice = (job?.agreed_price as number) ?? 0;
  const billingCycle = (job?.billing_cycle as string) ?? 'monthly';

  // Fetch all sessions in the billing period
  const { data: sessions, error: sessionsError } = await supabase
    .from('recurring_sessions')
    .select('*')
    .eq('recurring_job_id', recurringJobId)
    .gte('scheduled_date', billingPeriodStart)
    .lte('scheduled_date', billingPeriodEnd)
    .order('scheduled_date', { ascending: true });

  if (sessionsError) throw new Error(sessionsError.message);

  const allSessions = (sessions ?? []) as RecurringSession[];

  const regularSessions = allSessions.filter((s) => s.status === 'completed');
  const extraSessions = allSessions.filter((s) => s.status === 'extra');
  const skippedSessions = allSessions.filter((s) => s.status === 'skipped');

  const subtotal = agreedPrice * regularSessions.length;
  const extrasTotal = extraSessions.reduce((sum, s) => sum + (s.extra_cost ?? 0), 0);

  return {
    regularSessions,
    extraSessions,
    skippedSessions,
    subtotal,
    extrasTotal,
    total: subtotal + extrasTotal,
    billingCycle,
  };
}
