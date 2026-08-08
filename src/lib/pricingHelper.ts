import { supabase } from './supabase';
import type { QuoteTemplate, CustomTaskSuggestion } from '../types/database';
import { COST_BASIS_DEFAULTS } from './costModel';
import type { CostBasis, QuoteCostSnapshot } from './costModel';

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Helper data access:
//   • custom task suggestions (the "Other" trade feedback loop)
//   • quote templates (save a sent quote, reuse it later)
//   • area price range (anonymised, aggregate-only market data)
//   • cost basis (the tradie's private wage/overhead/profit settings)
// ─────────────────────────────────────────────────────────────────────────────

// ── Custom task suggestions ──────────────────────────────────────────────────

/** Submit (or increment) a custom task suggestion from the "Other" trade. */
export async function submitCustomTask(taskName: string, tradeContext?: string | null): Promise<{ ok: boolean; error?: string }> {
  const name = taskName.trim();
  if (name.length < 2) return { ok: false, error: 'Describe the task in a few words.' };
  // Omit rather than pass null: `supabase gen types` maps a SQL `DEFAULT NULL`
  // param to an optional property, and omitting it lets that default apply —
  // identical at runtime.
  const { error } = await supabase.rpc('submit_custom_task', {
    p_task_name: name,
    ...(tradeContext ? { p_trade_context: tradeContext } : {}),
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
    // quote_templates.message is NOT NULL. Callers pass `message.trim() || null`,
    // so a template saved with an empty body sent null and hit a 23502 that the
    // caller then discarded — the save just silently did nothing.
    message: input.message ?? '',
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

// ── Cost basis (tradie-private) ──────────────────────────────────────────────
//
// Lives in its own table rather than on tradie_details, which PublicTradieProfile
// reads — a wage or profit target stored there would be published to the open web.
// RLS is owner-only, so these calls return nothing for anyone but the tradie.

/**
 * Margin % a quote gets when the tradie has never saved one. Matches the value
 * the estimator hardcoded before the column existed, so nothing moves for anyone
 * who has not touched it.
 *
 * Charge-side, so it lives here and NOT in CostBasis: costModel prices what a job
 * COSTS and must stay ignorant of what the tradie charges on top.
 */
export const DEFAULT_MARGIN_PCT = 15;

/** Same story as DEFAULT_MARGIN_PCT: the estimator's previous hardcoded value. */
export const DEFAULT_MATERIALS_MARKUP_PCT = 20;

export interface QuotingDefaults {
  basis: CostBasis;
  /** Charge-side margin %, remembered from the last quote the tradie applied. */
  marginPct: number;
  /** Charge-side materials markup %, remembered the same way. */
  materialsMarkupPct: number;
}

/** The charge-side defaults, edited together on the Quoting rates card. */
export interface QuotingRates {
  marginPct: number;
  materialsMarkupPct: number;
}

/**
 * Everything the estimator prefills, in one round trip. The margin shares
 * tradie_cost_settings with the cost basis because that table is owner-only;
 * tradie_details, where hourly_rate lives, is readable by every authenticated
 * user and would hand clients the tradie's markup.
 */
export async function getQuotingDefaults(tradieId: string): Promise<QuotingDefaults> {
  const { data, error } = await supabase
    .from('tradie_cost_settings')
    .select('staff_wage_cents, labour_burden_pct, overhead_recovery_pct, profit_target_pct, minimum_job_value_cents, default_margin_pct, default_materials_markup_pct')
    .eq('tradie_id', tradieId)
    .maybeSingle();

  if (error || !data) {
    return {
      basis: COST_BASIS_DEFAULTS,
      marginPct: DEFAULT_MARGIN_PCT,
      materialsMarkupPct: DEFAULT_MATERIALS_MARKUP_PCT,
    };
  }

  return {
    basis: {
      staffWageCents: data.staff_wage_cents ?? COST_BASIS_DEFAULTS.staffWageCents,
      labourBurdenPct: data.labour_burden_pct ?? COST_BASIS_DEFAULTS.labourBurdenPct,
      overheadRecoveryPct: data.overhead_recovery_pct ?? COST_BASIS_DEFAULTS.overheadRecoveryPct,
      profitTargetPct: data.profit_target_pct ?? COST_BASIS_DEFAULTS.profitTargetPct,
      minimumJobValueCents: data.minimum_job_value_cents ?? COST_BASIS_DEFAULTS.minimumJobValueCents,
    },
    // ?? not ||: 0 is a legitimate saved value for both (an hourly rate that
    // already carries the profit; materials passed through at cost), and must
    // not fall through to the defaults.
    marginPct: data.default_margin_pct ?? DEFAULT_MARGIN_PCT,
    materialsMarkupPct: data.default_materials_markup_pct ?? DEFAULT_MATERIALS_MARKUP_PCT,
  };
}

/**
 * The tradie's cost basis, or the defaults when they haven't set one. Never
 * returns null on a miss: a fresh tradie gets workable percentages and a wage of
 * 0, and a wage of 0 is what keeps the margin check switched off.
 */
export async function getCostBasis(tradieId: string): Promise<CostBasis> {
  return (await getQuotingDefaults(tradieId)).basis;
}

/**
 * Remember the margin the tradie just quoted at, without disturbing their cost
 * basis. The upsert names only this column, so an existing row keeps every other
 * value and a first-time row takes the table's own defaults for the rest.
 *
 * Best-effort by design: this fires as a side effect of applying an estimate, and
 * a failed preference write must never interrupt that.
 */
export async function saveDefaultMarginPct(tradieId: string, marginPct: number): Promise<{ ok: boolean }> {
  if (!Number.isFinite(marginPct)) return { ok: false };
  const { error } = await supabase.from('tradie_cost_settings').upsert(
    { tradie_id: tradieId, default_margin_pct: clampPct(marginPct) },
    { onConflict: 'tradie_id' },
  );
  return { ok: !error };
}

const clampPct = (n: number): number => Math.min(200, Math.max(0, n));

/**
 * Save both charge-side rates together, for the Quoting rates card. Same partial
 * upsert as saveDefaultMarginPct: naming only these columns leaves the cost basis
 * on an existing row untouched, and lets a first-time row take the table's own
 * defaults for the rest.
 */
export async function saveQuotingRates(tradieId: string, rates: QuotingRates): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(rates.marginPct) || !Number.isFinite(rates.materialsMarkupPct)) {
    return { ok: false, error: 'Enter both percentages as numbers.' };
  }
  const { error } = await supabase.from('tradie_cost_settings').upsert(
    {
      tradie_id: tradieId,
      default_margin_pct: clampPct(rates.marginPct),
      default_materials_markup_pct: clampPct(rates.materialsMarkupPct),
    },
    { onConflict: 'tradie_id' },
  );
  if (error) return { ok: false, error: 'Could not save your rates. Check the figures and try again.' };
  return { ok: true };
}

/** Upsert the cost basis. One row per tradie, keyed on the UNIQUE tradie_id. */
export async function saveCostBasis(tradieId: string, basis: CostBasis): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('tradie_cost_settings').upsert(
    {
      tradie_id: tradieId,
      staff_wage_cents: Math.max(0, Math.round(basis.staffWageCents)),
      labour_burden_pct: basis.labourBurdenPct,
      overhead_recovery_pct: basis.overheadRecoveryPct,
      profit_target_pct: basis.profitTargetPct,
      minimum_job_value_cents: Math.max(0, Math.round(basis.minimumJobValueCents)),
    },
    { onConflict: 'tradie_id' },
  );
  if (error) return { ok: false, error: 'Could not save your cost basis. Check the figures and try again.' };
  return { ok: true };
}

/**
 * Record what the numbers were when a quote went out. Best-effort: a failure
 * here must never surface to the tradie or undo a quote that has already been
 * sent — the snapshot is for their later reference, not part of the send.
 */
export async function saveQuoteCostSnapshot(
  quoteId: string,
  tradieId: string,
  basis: QuoteCostSnapshot,
): Promise<void> {
  await supabase
    .from('quote_cost_snapshots')
    .upsert({ quote_id: quoteId, tradie_id: tradieId, basis }, { onConflict: 'quote_id' });
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
    ...(property ? { p_property: property } : {}),
    ...(lat != null ? { p_lat: lat } : {}),
    ...(lng != null ? { p_lng: lng } : {}),
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
