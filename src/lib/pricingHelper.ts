import { supabase } from './supabase';
import type { QuoteTemplate, CustomTaskSuggestion } from '../types/database';

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Helper data access:
//   • custom task suggestions (the "Other" trade feedback loop)
//   • quote templates (save a sent quote, reuse it later)
//   • area price range (anonymised, aggregate-only market data)
// ─────────────────────────────────────────────────────────────────────────────

// ── Custom task suggestions ──────────────────────────────────────────────────

/** Submit (or increment) a custom task suggestion from the "Other" trade. */
export async function submitCustomTask(taskName: string, tradeContext?: string | null): Promise<{ ok: boolean; error?: string }> {
  const name = taskName.trim();
  if (name.length < 2) return { ok: false, error: 'Describe the task in a few words.' };
  const { error } = await supabase.rpc('submit_custom_task', {
    p_task_name: name,
    p_trade_context: tradeContext ?? null,
  });
  if (error) return { ok: false, error: 'Could not submit — please try again.' };
  return { ok: true };
}

/** Approved custom tasks → quick-add chips. Optionally scoped to a category. */
export async function getApprovedCustomTasks(category?: string | null): Promise<string[]> {
  let q = supabase
    .from('custom_task_suggestions')
    .select('task_name, approved_as_category')
    .eq('status', 'approved')
    .order('times_submitted', { ascending: false })
    .limit(12);
  if (category) q = q.eq('approved_as_category', category);
  const { data } = await q;
  return ((data as { task_name: string }[] | null) ?? []).map((r) => r.task_name);
}

// ── Admin moderation ─────────────────────────────────────────────────────────

/** Admin: list suggestions by status, most-requested first. */
export async function listCustomTaskSuggestions(status: 'pending' | 'approved' | 'rejected' = 'pending'): Promise<CustomTaskSuggestion[]> {
  const { data } = await supabase
    .from('custom_task_suggestions')
    .select('*')
    .eq('status', status)
    .order('times_submitted', { ascending: false })
    .order('created_at', { ascending: false });
  return (data as CustomTaskSuggestion[] | null) ?? [];
}

/** Admin: approve a suggestion, folding it into a category. */
export async function approveCustomTask(id: string, reviewerId: string, category: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from('custom_task_suggestions')
    .update({
      status: 'approved',
      approved_as_category: category.trim(),
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { ok: !error };
}

/** Admin: reject/ignore a suggestion. */
export async function rejectCustomTask(id: string, reviewerId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from('custom_task_suggestions')
    .update({ status: 'rejected', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  return { ok: !error };
}

// ── Quote templates ──────────────────────────────────────────────────────────

export interface SaveTemplateInput {
  name: string;
  title?: string | null;
  scope?: string | null;
  internalNotes?: string | null;
  message?: string | null;
  price?: number | null;
  propertyType?: string | null;
  tradeCategory?: string | null;
  estimatedDuration?: string | null;
  conditions?: string | null;
}

export async function listQuoteTemplates(tradieId: string): Promise<QuoteTemplate[]> {
  const { data } = await supabase
    .from('quote_templates')
    .select('*')
    .eq('tradie_id', tradieId)
    .order('created_at', { ascending: false });
  return (data as QuoteTemplate[] | null) ?? [];
}

export async function saveQuoteTemplate(tradieId: string, input: SaveTemplateInput): Promise<{ ok: boolean; error?: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give the template a name.' };
  const { error } = await supabase.from('quote_templates').insert({
    tradie_id: tradieId,
    name,
    title: input.title ?? null,
    scope: input.scope ?? null,
    internal_notes: input.internalNotes ?? null,
    message: input.message ?? null,
    price: input.price ?? null,
    property_type: input.propertyType ?? null,
    trade_category: input.tradeCategory ?? null,
    default_duration: input.estimatedDuration ?? null,
    conditions: input.conditions ?? null,
    includes_materials: false,
  });
  if (error) return { ok: false, error: 'Could not save the template.' };
  return { ok: true };
}

export async function deleteQuoteTemplate(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('quote_templates').delete().eq('id', id);
  return { ok: !error };
}

// ── Area price range (anonymised market data) ────────────────────────────────

export interface AreaPriceRange {
  sampleSize: number;
  low: number | null;
  high: number | null;
  mid: number | null;
}

/**
 * Aggregate market range for a trade + property in the client's area. Returns a
 * range only when there are ≥5 comparable quotes (privacy floor); otherwise the
 * range fields are null. Never exposes individual quotes.
 */
export async function getAreaPriceRange(
  trade: string,
  property?: string | null,
  lat?: number | null,
  lng?: number | null,
): Promise<AreaPriceRange | null> {
  const { data, error } = await supabase.rpc('get_area_price_range', {
    p_trade: trade,
    p_property: property ?? null,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { sample_size: number; price_low: number | null; price_high: number | null; price_mid: number | null }
    | undefined;
  if (!row) return null;
  return {
    sampleSize: row.sample_size ?? 0,
    low: row.price_low ?? null,
    high: row.price_high ?? null,
    mid: row.price_mid ?? null,
  };
}
