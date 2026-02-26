import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecurringJobData {
  client_id?: string;
  tradie_id: string;
  trade_category: string;
  description: string;
  frequency_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active?: boolean;
  original_job_id?: string;
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
  tradie?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export interface RecurringJobSuggestion {
  tradeCategory: string;
  frequencyMonths: number;
  label: string;
  description: string;
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

export const DEFAULT_FREQUENCIES: Record<string, number> = {
  plumbing: 12,
  lawn_mowing: 1,
  painting: 60,
  electrical: 24,
  carpentry: 36,
  landscaping: 3,
  cleaning: 1,
  pest_control: 12,
  roofing: 24,
  hvac: 12,
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
  next.setMonth(next.getMonth() + frequencyMonths);
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
      tradie_id: data.tradie_id,
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
 * Update a recurring job.
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

  for (const job of data) {
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
        tradie_name: (job.tradie as unknown as { full_name: string })?.full_name ?? 'Unknown',
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
    plumbing: 'Annual plumbing inspection',
    lawn_mowing: 'Monthly lawn mowing',
    painting: 'Repaint (every 5 years)',
    electrical: 'Biennial electrical safety check',
    carpentry: 'Timber maintenance (every 3 years)',
    landscaping: 'Quarterly garden maintenance',
    cleaning: 'Monthly cleaning service',
    pest_control: 'Annual pest treatment',
    roofing: 'Biennial roof inspection',
    hvac: 'Annual HVAC service',
  };

  const descriptions: Record<string, string> = {
    plumbing: 'Regular plumbing inspection to check pipes, taps, and hot water system.',
    lawn_mowing: 'Regular lawn mowing and edging to keep your yard neat.',
    painting: 'Full interior/exterior repaint to maintain your property.',
    electrical: 'Electrical safety inspection including switchboard and smoke alarms.',
    carpentry: 'Inspection and maintenance of timber structures, decks, and fences.',
    landscaping: 'Seasonal garden maintenance including pruning, mulching, and planting.',
    cleaning: 'Thorough home cleaning including kitchens, bathrooms, and living areas.',
    pest_control: 'Comprehensive pest treatment for spiders, ants, cockroaches, and termites.',
    roofing: 'Roof inspection for leaks, damaged tiles, and gutter cleaning.',
    hvac: 'Air conditioning and heating system service and filter replacement.',
  };

  return {
    tradeCategory,
    frequencyMonths,
    label: labels[key] ?? `Regular ${tradeCategory} service`,
    description: descriptions[key] ?? `Recurring ${tradeCategory} maintenance service.`,
  };
}
