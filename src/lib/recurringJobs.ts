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
  lawn_mowing_weekly: FREQ_WEEKLY,
  pool_maintenance_weekly: FREQ_WEEKLY,
  // Fortnightly services
  cleaning_fortnightly: FREQ_FORTNIGHTLY,
  lawn_mowing_fortnightly: FREQ_FORTNIGHTLY,
  garden_maintenance_fortnightly: FREQ_FORTNIGHTLY,
  // Monthly services
  cleaning: 1,
  lawn_mowing: 1,
  // Quarterly services
  landscaping: 3,
  pool_maintenance: 3,
  garden_maintenance: 3,
  // Biannual services
  gutter_cleaning: 6,
  window_cleaning: 6,
  carpet_cleaning: 6,
  // Annual services
  plumbing: 12,
  pest_control: 12,
  hvac: 12,
  air_conditioning: 12,
  solar: 12,
  fire_safety: 12,
  hot_water_service: 12,
  septic_tank: 12,
  chimney_sweep: 12,
  garage_doors: 12,
  security_systems: 12,
  appliance_service: 12,
  // Biennial services
  electrical: 24,
  roofing: 24,
  waterproofing: 24,
  tree_lopping: 24,
  termite_inspection: 24,
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
    lawn_mowing_weekly: 'Weekly lawn mowing',
    pool_maintenance_weekly: 'Weekly pool service',
    // Fortnightly
    cleaning_fortnightly: 'Fortnightly house cleaning',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing',
    garden_maintenance_fortnightly: 'Fortnightly garden care',
    // Monthly
    cleaning: 'Monthly cleaning service',
    lawn_mowing: 'Monthly lawn mowing',
    // Quarterly
    landscaping: 'Quarterly garden maintenance',
    pool_maintenance: 'Quarterly pool service',
    garden_maintenance: 'Quarterly garden care',
    // Biannual
    gutter_cleaning: 'Biannual gutter clean',
    window_cleaning: 'Biannual window clean',
    carpet_cleaning: 'Biannual carpet steam clean',
    // Annual
    plumbing: 'Annual plumbing inspection',
    pest_control: 'Annual pest treatment',
    hvac: 'Annual HVAC service',
    air_conditioning: 'Annual aircon service',
    solar: 'Annual solar panel inspection',
    fire_safety: 'Annual fire safety check',
    hot_water_service: 'Annual hot water service',
    septic_tank: 'Annual septic pump-out',
    chimney_sweep: 'Annual chimney sweep',
    garage_doors: 'Annual garage door service',
    security_systems: 'Annual security system check',
    appliance_service: 'Annual appliance service',
    // Biennial
    electrical: 'Biennial electrical safety check',
    roofing: 'Biennial roof inspection',
    waterproofing: 'Biennial waterproofing check',
    tree_lopping: 'Biennial tree lopping',
    termite_inspection: 'Biennial termite inspection',
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
    lawn_mowing_weekly: 'Weekly lawn mowing, edging, and blowing.',
    pool_maintenance_weekly: 'Weekly pool chemical balance, skim, brush, and filter basket clean.',
    cleaning_fortnightly: 'Fortnightly deep clean: kitchens, bathrooms, floors, and surfaces.',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing, edging, and garden tidy.',
    garden_maintenance_fortnightly: 'Fortnightly weeding, pruning, and garden bed maintenance.',
    cleaning: 'Thorough home cleaning including kitchens, bathrooms, and living areas.',
    lawn_mowing: 'Regular lawn mowing, edging, and blowing to keep your yard neat.',
    landscaping: 'Seasonal garden maintenance including pruning, mulching, and planting.',
    pool_maintenance: 'Pool chemical balance, filter clean, pump check, and water testing.',
    garden_maintenance: 'Garden bed weeding, pruning, mulching, and seasonal planting.',
    gutter_cleaning: 'Clear gutters and downpipes of leaves and debris to prevent water damage.',
    window_cleaning: 'Interior and exterior window cleaning for all accessible windows.',
    carpet_cleaning: 'Professional carpet steam cleaning to remove dirt, stains, and allergens.',
    plumbing: 'Plumbing inspection: check pipes, taps, toilet mechanisms, and hot water system.',
    pest_control: 'Comprehensive pest treatment for spiders, ants, cockroaches, and termites.',
    hvac: 'Air conditioning and heating system service and filter replacement.',
    air_conditioning: 'Split system or ducted aircon service, gas top-up, and filter clean.',
    solar: 'Solar panel cleaning, inverter check, and performance inspection.',
    fire_safety: 'Smoke alarm testing, fire extinguisher check, and exit light inspection.',
    hot_water_service: 'Hot water system flush, anode rod check, and temperature/pressure relief valve test.',
    septic_tank: 'Septic tank pump-out and system inspection.',
    chimney_sweep: 'Chimney and flue cleaning to prevent fire hazards and improve airflow.',
    garage_doors: 'Garage door service: spring tension, track alignment, and motor check.',
    security_systems: 'Security alarm testing, camera check, and sensor calibration.',
    appliance_service: 'Service and clean major appliances (oven, dishwasher, dryer).',
    electrical: 'Electrical safety inspection including switchboard, smoke alarms, and RCD testing.',
    roofing: 'Roof inspection for leaks, damaged tiles, ridge capping, and gutter condition.',
    waterproofing: 'Check waterproof membranes in wet areas, balconies, and below-grade walls.',
    tree_lopping: 'Tree pruning, dead limb removal, and canopy shaping.',
    termite_inspection: 'Full termite inspection with thermal imaging and moisture detection.',
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
    cleaning_fortnightly: { min: 100, max: 220, unit: 'per visit' },
    cleaning: { min: 120, max: 300, unit: 'per visit' },
    lawn_mowing_weekly: { min: 40, max: 80, unit: 'per visit' },
    lawn_mowing_fortnightly: { min: 50, max: 100, unit: 'per visit' },
    lawn_mowing: { min: 50, max: 120, unit: 'per visit' },
    pool_maintenance_weekly: { min: 60, max: 120, unit: 'per visit' },
    pool_maintenance: { min: 150, max: 350, unit: 'per visit' },
    garden_maintenance_fortnightly: { min: 80, max: 160, unit: 'per visit' },
    garden_maintenance: { min: 150, max: 400, unit: 'per visit' },
    landscaping: { min: 200, max: 600, unit: 'per visit' },
    gutter_cleaning: { min: 150, max: 350, unit: 'per visit' },
    window_cleaning: { min: 150, max: 400, unit: 'per visit' },
    carpet_cleaning: { min: 120, max: 350, unit: 'per visit' },
    plumbing: { min: 150, max: 350, unit: 'per visit' },
    pest_control: { min: 150, max: 400, unit: 'per visit' },
    hvac: { min: 120, max: 300, unit: 'per visit' },
    air_conditioning: { min: 100, max: 250, unit: 'per visit' },
    electrical: { min: 200, max: 450, unit: 'per visit' },
    roofing: { min: 200, max: 500, unit: 'per visit' },
    painting: { min: 2000, max: 8000, unit: 'per job' },
    solar: { min: 150, max: 350, unit: 'per visit' },
    tree_lopping: { min: 300, max: 1500, unit: 'per visit' },
    termite_inspection: { min: 200, max: 400, unit: 'per visit' },
    fencing: { min: 100, max: 300, unit: 'per visit' },
    concreting: { min: 200, max: 500, unit: 'per visit' },
    tiling: { min: 200, max: 500, unit: 'per visit' },
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
}

/**
 * Skip a session with a reason.
 */
export async function skipSession(
  sessionId: string,
  reason: string,
  by: 'client' | 'tradie',
): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      status: 'skipped',
      reschedule_reason: reason,
      reschedule_by: by,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
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
): Promise<RecurringSession> {
  const { data, error } = await supabase
    .from('recurring_sessions')
    .insert({
      recurring_job_id: recurringJobId,
      scheduled_date: date,
      status: 'extra',
      extra_hours: extraHours,
      extra_cost: extraCost,
      notes,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as RecurringSession;
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
