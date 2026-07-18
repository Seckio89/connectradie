// ─────────────────────────────────────────────────────────────────────────────
// QuoteEstimator (v2) — structured, economics-aware pricing helper.
//
// Accuracy model: the tradie answers TRADE-SPECIFIC questions (the fields change
// per trade), the AI estimates only the physical work (hours + materials), and
// the price is computed from the tradie's OWN economics (rate, workers, margin,
// GST, call-out + auto travel) — shown as an EDITABLE line-item breakdown that
// recomputes live. Their own recent accepted quotes anchor the estimate. It only
// suggests; the tradie edits and applies. Low-confidence / licensed jobs steer to
// a site visit rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, Camera, X, AlertTriangle, Check, Info, ChevronDown, HelpCircle, Lock, Package, BarChart3, Plus, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateDistance } from '../hooks/useGeolocation';
import type { ClientContact } from '../types/database';
import PropertyPreview from './PropertyPreview';
import { TIER_PRICING } from '../lib/subscription';
import { submitCustomTask, getApprovedCustomTasks, getAreaPriceRange, type AreaPriceRange } from '../lib/pricingHelper';

interface QuoteEstimatorProps {
  /**
   * scope = client-visible duty lines; internal = tradie-only assumptions/hours.
   * trade/property tag the resulting quote so it can feed anonymised area stats.
   */
  onApply: (price: number, extras: { scope: string[]; internal: string; trade?: string; property?: string }) => void;
  contact: ClientContact;
}

interface WorkEstimate {
  source: 'ai' | 'estimate';
  hours: number;
  materialsCost: number;
  confidence: 'low' | 'medium' | 'high';
  needsSiteVisit: boolean;
  assumptions: string[];
  sharpeningQuestions: string[];
}

interface Economics {
  hourlyRate: number; workers: number; marginPct: number;
  materialsMarkupPct: number; gstRegistered: boolean; callOutFee: number; travelKm: number;
}

const TRADES = ['Cleaning', 'Painting', 'Plumbing', 'Electrical', 'Flooring / Tiling', 'Fencing', 'Landscaping', 'Carpentry', 'Handyman', 'Other'];

// Property type reshapes the quantity questions — commercial pricing runs on
// workstations/toilets/area, not "rooms and bathrooms".
const PROPERTY_TYPES = ['Residential', 'Office', 'Retail', 'Warehouse', 'Strata / common areas'];

const TRADE_FIELDS: Record<string, { key: string; label: string }[]> = {
  Cleaning: [{ key: 'rooms', label: 'Rooms' }, { key: 'bathrooms', label: 'Bathrooms' }, { key: 'sqm', label: 'Area m²' }],
  Painting: [{ key: 'rooms', label: 'Rooms' }, { key: 'sqm', label: 'Wall m²' }, { key: 'coats', label: 'Coats' }],
  Plumbing: [{ key: 'fixtures', label: 'Fixtures' }],
  Electrical: [{ key: 'points', label: 'Points / outlets' }],
  'Flooring / Tiling': [{ key: 'sqm', label: 'Area m²' }],
  Fencing: [{ key: 'linearMetres', label: 'Length (m)' }],
  Landscaping: [{ key: 'sqm', label: 'Area m²' }, { key: 'linearMetres', label: 'Edging (m)' }],
  Carpentry: [{ key: 'rooms', label: 'Rooms / units' }],
  Handyman: [{ key: 'rooms', label: 'Rooms' }, { key: 'sqm', label: 'Area m²' }],
  Other: [{ key: 'rooms', label: 'Rooms' }, { key: 'sqm', label: 'Area m²' }],
};

// Commercial overrides (keyed `trade|property`); anything not listed falls back
// to the trade defaults — most trades are already area/count based.
const COMMERCIAL_FIELDS: Record<string, { key: string; label: string }[]> = {
  'Cleaning|Office': [{ key: 'workstations', label: 'Workstations' }, { key: 'toilets', label: 'Toilets' }, { key: 'sqm', label: 'Area m²' }],
  'Cleaning|Retail': [{ key: 'sqm', label: 'Floor m²' }, { key: 'toilets', label: 'Toilets' }],
  'Cleaning|Warehouse': [{ key: 'sqm', label: 'Floor m²' }, { key: 'toilets', label: 'Toilets' }, { key: 'mezzanines', label: 'Mezzanines' }],
  'Cleaning|Strata / common areas': [{ key: 'levels', label: 'Levels' }, { key: 'toilets', label: 'Shared toilets' }, { key: 'sqm', label: 'Common m²' }],
  'Painting|Office': [{ key: 'sqm', label: 'Wall m²' }, { key: 'coats', label: 'Coats' }],
  'Painting|Warehouse': [{ key: 'sqm', label: 'Wall/ceiling m²' }, { key: 'coats', label: 'Coats' }],
};

function fieldsFor(trade: string, property: string): { key: string; label: string }[] {
  return COMMERCIAL_FIELDS[`${trade}|${property}`] ?? TRADE_FIELDS[trade] ?? TRADE_FIELDS.Other;
}

const CONDITIONS = ['light', 'standard', 'heavy', 'complex'];
const ACCESS = ['Stairs', 'Tight access', 'No parking', 'Multi-storey'];

// Estimated-duration dropdown options + the day picker (Mon-first, AU convention).
const HOUR_OPTS = Array.from({ length: 13 }, (_, i) => i); // 0–12
const MIN_OPTS = [0, 15, 30, 45];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "2h 30m" / "45m" / "2h" — compact human duration from hours + minutes.
function durationLabel(h: number, m: number): string {
  if (!h && !m) return '';
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

const CONF_CHIP: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-secondary-100 text-secondary-700',
  low: 'bg-amber-100 text-amber-700',
};

const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no canvas')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Mirror of the backend money math so edits recompute live.
function computePrice(hours: number, materialsCost: number, e: Economics, clientSupplies: boolean) {
  const labour = hours * e.hourlyRate * e.workers;
  const materials = clientSupplies ? 0 : materialsCost * (1 + e.materialsMarkupPct / 100);
  // No call-out fee set → no call-out component at all (including the
  // distance-based travel part) — the line disappears from the breakdown.
  const travel = e.callOutFee > 0 && e.travelKm > 0 ? Math.round(e.travelKm * 0.6) : 0;
  const callOut = e.callOutFee > 0 ? e.callOutFee + travel : 0;
  const items: { label: string; amount: number; detail?: string }[] = [
    { label: 'Labour', amount: labour, detail: `${hours} h × ${money(e.hourlyRate)}/h${e.workers > 1 ? ` × ${e.workers}` : ''}` },
  ];
  if (materials > 0) items.push({ label: 'Materials', amount: materials, detail: `+${e.materialsMarkupPct}% markup` });
  if (callOut > 0) items.push({ label: 'Call-out', amount: callOut, detail: e.travelKm > 0 ? `incl. ~${Math.round(e.travelKm)} km` : undefined });
  const base = labour + materials + callOut;
  const margin = base * (e.marginPct / 100);
  if (margin > 0) items.push({ label: 'Margin', amount: margin, detail: `${e.marginPct}%` });
  const subtotal = base + margin;
  const gst = e.gstRegistered ? subtotal * 0.1 : 0;
  return { items, subtotal, gst, total: subtotal + gst };
}

export default function QuoteEstimator({ onApply, contact }: QuoteEstimatorProps) {
  const { user, profile, tradieDetails } = useAuth();

  const [trade, setTrade] = useState('');
  const [property, setProperty] = useState('Residential');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [condition, setCondition] = useState('');
  const [access, setAccess] = useState<Set<string>>(new Set());
  const [durHours, setDurHours] = useState('');
  const [durMins, setDurMins] = useState('');
  const [preferredDays, setPreferredDays] = useState<Set<string>>(new Set());
  const [multiVisit, setMultiVisit] = useState(false);
  const [visitCount, setVisitCount] = useState('2');
  const [visitSpan, setVisitSpan] = useState('weeks');
  const [clientSupplies, setClientSupplies] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const MAX_PHOTOS = 15;

  const [econOpen, setEconOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [workers, setWorkers] = useState('1');
  const [marginPct, setMarginPct] = useState('15');
  const [markupPct, setMarkupPct] = useState('20');
  const [callOut, setCallOut] = useState('');

  const [history, setHistory] = useState<{ price: number; title: string; date: string | null }[]>([]);
  const [hoursEdit, setHoursEdit] = useState('');

  // "Other" trade: free-text task + the approved-suggestion quick-add chips.
  const [customTask, setCustomTask] = useState('');
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [approvedTasks, setApprovedTasks] = useState<string[]>([]);

  // Anonymised area market range (Pro/PM only; needs ≥5 comparable quotes).
  const [areaRange, setAreaRange] = useState<AreaPriceRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WorkEstimate | null>(null);
  // AI-estimate allowance: monthly free credits + non-expiring pack credits.
  // limit null = unlimited (Pro/PM); aiUsage null = not resolved (fail open, no gate).
  const [aiUsage, setAiUsage] = useState<{ limit: number | null; used: number; packRemaining: number } | null>(null);
  const [aiBlocked, setAiBlocked] = useState(false);
  const [buyingPack, setBuyingPack] = useState(false);

  // Prefill economics from the tradie's profile once loaded.
  useEffect(() => {
    if (tradieDetails?.hourly_rate) setRate(String(tradieDetails.hourly_rate));
    if (profile?.call_out_fee) setCallOut(String(profile.call_out_fee));
    else if (tradieDetails?.default_call_out_fee_cents) setCallOut(String(Math.round(tradieDetails.default_call_out_fee_cents / 100)));
  }, [tradieDetails, profile]);

  // Auto travel distance from the tradie's base to the client.
  const travelKm = useMemo(() => {
    if (profile?.base_latitude && profile?.base_longitude && contact.latitude && contact.longitude) {
      return Math.round(calculateDistance(profile.base_latitude, profile.base_longitude, contact.latitude, contact.longitude));
    }
    return 0;
  }, [profile, contact]);

  // Pull the tradie's recent accepted quotes as pricing anchors.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('quotes')
        .select('firm_price, price_min, created_at, jobs(title)')
        .eq('tradie_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(6);
      const rows = (data as unknown as { firm_price: number | null; price_min: number | null; created_at: string | null; jobs: { title: string | null } | null }[]) ?? [];
      setHistory(rows
        .map((r) => ({ price: r.firm_price ?? r.price_min ?? 0, title: r.jobs?.title ?? 'Job', date: r.created_at }))
        .filter((h) => h.price > 0));
    })();
  }, [user]);

  const economics: Economics = {
    hourlyRate: Number(rate) || 75,
    workers: Math.max(1, Number(workers) || 1),
    marginPct: Number(marginPct) || 0,
    materialsMarkupPct: Number(markupPct) || 0,
    gstRegistered: !!profile?.is_gst_registered,
    callOutFee: Number(callOut) || 0,
    travelKm,
  };

  const toggleAccess = (a: string) => setAccess((prev) => {
    const next = new Set(prev); next.has(a) ? next.delete(a) : next.add(a); return next;
  });

  const toggleDay = (d: string) => setPreferredDays((prev) => {
    const next = new Set(prev); next.has(d) ? next.delete(d) : next.add(d); return next;
  });

  // Tradie-entered time on site overrides the AI's hour guess when set.
  const enteredHours = (Number(durHours) || 0) + (Number(durMins) || 0) / 60;
  // Repeat visits multiply the per-visit price. Clamp to something sane.
  const visits = multiVisit ? Math.min(60, Math.max(1, Number(visitCount) || 1)) : 1;
  const orderedDays = DAYS.filter((d) => preferredDays.has(d)); // keeps Mon→Sun order

  // Balance = monthly free remaining + non-expiring pack credits.
  const aiMonthlyRemaining = aiUsage && aiUsage.limit != null ? Math.max(0, aiUsage.limit - aiUsage.used) : null;
  const aiPackRemaining = aiUsage ? aiUsage.packRemaining : 0;
  const aiTotalRemaining = aiMonthlyRemaining === null ? null : aiMonthlyRemaining + aiPackRemaining;
  const aiLimitReached = aiTotalRemaining !== null && aiTotalRemaining <= 0;

  // Resolve the tradie's tier + this month's usage + pack credits for the counter.
  // Mirrors the edge function: paid tier through grace, UTC month boundary.
  const loadAiUsage = useCallback(async () => {
    if (!user) return;
    try {
      const { data: sub } = await supabase
        .from('tradie_subscriptions')
        .select('tier_id, status, grace_until')
        .eq('profile_id', user.id)
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const s = sub as { tier_id: string; status: string; grace_until: string | null } | null;
      let tier = 'free';
      if (s && (s.tier_id === 'pro' || s.tier_id === 'pm')) {
        if (s.status === 'active') tier = s.tier_id;
        else if (s.status === 'past_due' && s.grace_until && new Date(s.grace_until) > new Date()) tier = s.tier_id;
      }
      const { data: tierRow } = await supabase
        .from('pricing_tiers')
        .select('ai_estimates_monthly_limit')
        .eq('id', tier)
        .maybeSingle();
      const limit = (tierRow as { ai_estimates_monthly_limit: number | null } | null)?.ai_estimates_monthly_limit ?? null;
      if (limit == null) { setAiUsage({ limit: null, used: 0, packRemaining: 0 }); return; }
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const [{ count }, { data: packs }] = await Promise.all([
        supabase
          .from('ai_estimate_usage')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', user.id)
          .gte('created_at', monthStart),
        supabase
          .from('estimate_packs')
          .select('credits_remaining')
          .eq('profile_id', user.id)
          .eq('status', 'active'),
      ]);
      const packRemaining = (packs as { credits_remaining: number }[] | null ?? [])
        .reduce((sum, p) => sum + (p.credits_remaining || 0), 0);
      setAiUsage({ limit, used: count ?? 0, packRemaining });
    } catch {
      setAiUsage(null); // fail open — show no counter / no gate if we can't resolve it
    }
  }, [user]);

  useEffect(() => { loadAiUsage(); }, [loadAiUsage]);

  // Unlimited AI estimates ⟹ Pro/PM. Market data is a paid-tier perk.
  const isPaidTier = aiUsage != null && aiUsage.limit === null;

  // Load approved custom tasks as quick-add chips when "Other" is chosen.
  useEffect(() => {
    if (trade !== 'Other') { setApprovedTasks([]); return; }
    let cancelled = false;
    getApprovedCustomTasks().then((t) => { if (!cancelled) setApprovedTasks(t); });
    return () => { cancelled = true; };
  }, [trade]);

  // Anonymised area market range. Fetched for all tiers (the numbers are only
  // shown to Pro/PM; free tier sees a teaser when data exists). The RPC only
  // ever returns aggregates over ≥5 comparable quotes — never individual rows.
  useEffect(() => {
    if (!trade || trade === 'Other') { setAreaRange(null); return; }
    let cancelled = false;
    getAreaPriceRange(trade.toLowerCase(), property.toLowerCase(), contact.latitude ?? null, contact.longitude ?? null)
      .then((r) => { if (!cancelled) setAreaRange(r); });
    return () => { cancelled = true; };
  }, [trade, property, contact.latitude, contact.longitude]);

  const shortDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';

  const submitTask = async () => {
    if (customTask.trim().length < 2) return;
    setTaskSubmitting(true);
    const r = await submitCustomTask(customTask, 'Other');
    setTaskSubmitting(false);
    if (r.ok) { setTaskSubmitted(true); setTimeout(() => setTaskSubmitted(false), 4000); }
  };

  // Buy a 20-credit AI Estimate Pack via one-time Stripe Checkout.
  const buyPack = async () => {
    setBuyingPack(true);
    try {
      const back = `${window.location.origin}${window.location.pathname}`;
      const { data, error: fnErr } = await supabase.functions.invoke('buy-estimate-pack', {
        body: { successUrl: `${back}?pack=success`, cancelUrl: `${back}?pack=cancelled` },
      });
      if (!fnErr && data?.url) { window.location.href = data.url as string; return; }
      setError('Could not start checkout. Please try again.');
    } catch { setError('Could not start checkout. Please try again.'); }
    setBuyingPack(false);
  };

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    for (const f of files) {
      try { const url = await fileToDataUrl(f); setPhotos((prev) => (prev.length < MAX_PHOTOS ? [...prev, url] : prev)); } catch { /* skip */ }
    }
    e.target.value = '';
  };

  const runEstimate = async () => {
    // Pre-empt the round-trip when we already know all credits are spent.
    if (aiLimitReached) { setAiBlocked(true); return; }
    setLoading(true); setError(''); setAiBlocked(false); setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('estimate-quote', {
        body: {
          trade: trade.toLowerCase(),
          jobType: property.toLowerCase(),
          quantities: Object.fromEntries(Object.entries(quantities).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
          condition: condition || undefined,
          access: [...access],
          materialsSuppliedBy: clientSupplies ? 'client' : 'tradie',
          notes: [trade === 'Other' ? customTask.trim() : '', notes.trim()].filter(Boolean).join(' — ') || undefined,
          economics,
          history,
          images: photos,
        },
      });
      if (data?.limitReached) {
        // Server says everything's spent — surface the buy/upgrade options.
        setAiBlocked(true);
        loadAiUsage();
      } else if (fnError || data?.error) {
        setError(data?.error || 'Could not generate an estimate. Please try again.');
      } else {
        const est = data as WorkEstimate;
        setResult(est);
        setHoursEdit(String(est.hours));
        loadAiUsage(); // re-sync monthly + pack balance from the authoritative source
      }
    } catch { setError('Could not generate an estimate. Please try again.'); }
    setLoading(false);
  };

  // Live price from the hours + economics. The tradie's entered time-on-site
  // (if any) is the source of truth for hours; otherwise the editable field /
  // AI guess is used. Repeat visits multiply the per-visit total.
  const priced = useMemo(() => {
    if (!result) return null;
    const hours = enteredHours > 0 ? enteredHours : (Number(hoursEdit) || result.hours);
    const per = computePrice(hours, result.materialsCost, economics, clientSupplies);
    return { ...per, perVisitTotal: per.total, total: per.total * visits, visits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hoursEdit, enteredHours, visits, rate, workers, marginPct, markupPct, callOut, clientSupplies, travelKm, profile?.is_gst_registered]);

  const applyResult = () => {
    if (!result || !priced) return;
    const dur = durationLabel(Number(durHours) || 0, Number(durMins) || 0);

    // Client-visible scope: availability is genuinely useful to the client;
    // the rest (hours, price rationale, visit logistics) stays internal.
    const scope: string[] = [];
    if (orderedDays.length) scope.push(`Available to visit: ${orderedDays.join(', ')}`);

    // Hours + assumptions + visit logistics are pricing rationale — they stay
    // tradie-only (internal notes), never the client-visible description.
    const hoursLabel = dur || `${hoursEdit || result.hours} h`;
    const internal =
      `Estimated ${hoursLabel}${visits > 1 ? '/visit' : ''} · ${money(priced.total)}` +
      (visits > 1 ? `\n${visits} visits${visitSpan ? ` over a few ${visitSpan}` : ''} · ${money(priced.perVisitTotal)}/visit` : '') +
      (orderedDays.length ? `\nPreferred days: ${orderedDays.join(', ')}` : '') +
      (result.assumptions.length ? `\nAssumptions:\n${result.assumptions.map((a) => `- ${a}`).join('\n')}` : '');
    onApply(Math.round(priced.total), { scope, internal, trade, property });
  };

  const fields = trade ? fieldsFor(trade, property) : [];
  const numInput = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="border border-secondary-200 bg-secondary-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-secondary-600" />
        <span className="text-sm font-semibold text-gray-900">Pricing helper</span>
        <span className="text-[11px] text-gray-500">suggests — you decide</span>
      </div>

      {/* Property preview — auto Street View from the client's stored address */}
      <PropertyPreview
        address={contact.address ?? null}
        lat={contact.latitude ?? null}
        lng={contact.longitude ?? null}
      />

      {/* Trade */}
      <div className="flex flex-wrap gap-1.5">
        {TRADES.map((t) => (
          <button key={t} type="button" onClick={() => { setTrade(t); setQuantities({}); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              trade === t ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>{t}</button>
        ))}
      </div>

      {trade && (
        <>
          {/* "Other" trade — capture the task in words + feed the review pipeline */}
          {trade === 'Other' && (
            <div className="rounded-lg border border-secondary-100 bg-white p-3 space-y-2">
              <label className="block text-xs font-medium text-gray-600">What type of work? Describe the task</label>
              <div className="flex items-center gap-2">
                <input type="text" value={customTask}
                  onChange={(e) => { setCustomTask(e.target.value); setTaskSubmitted(false); }}
                  placeholder="e.g. Pressure washing, gutter vac, solar panel clean…"
                  className={`flex-1 ${numInput}`} />
                <button type="button" onClick={submitTask} disabled={taskSubmitting || customTask.trim().length < 2}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-secondary-600 text-white text-xs font-medium hover:bg-secondary-700 disabled:opacity-50">
                  {taskSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Suggest
                </button>
              </div>
              {taskSubmitted
                ? <p className="text-[11px] text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Thanks — we’ll review this and may add it as a category.</p>
                : <p className="text-[11px] text-gray-400">Can’t see your trade? Tell us and we’ll add popular requests. Your description also sharpens the estimate.</p>}
              {approvedTasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {approvedTasks.map((t) => (
                    <button key={t} type="button" onClick={() => setCustomTask(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-white border-gray-200 text-gray-600 hover:bg-gray-50">
                      <Plus className="w-3 h-3" /> {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Property type — reshapes the quantity questions (office/warehouse ≠ rooms) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500">Property:</span>
            {PROPERTY_TYPES.map((p) => (
              <button key={p} type="button" onClick={() => { setProperty(p); setQuantities({}); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  property === p ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>{p}</button>
            ))}
          </div>

          {/* Trade-specific quantities */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-[11px] text-gray-500 mb-0.5">{f.label}</label>
                <input type="number" min="0" value={quantities[f.key] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [f.key]: e.target.value }))}
                  className={`w-full ${numInput}`} />
              </div>
            ))}
          </div>

          {/* Condition */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500">Condition:</span>
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCondition(condition === c ? '' : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                  condition === c ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>{c}</button>
            ))}
          </div>

          {/* Access */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-500">Access:</span>
            {ACCESS.map((a) => (
              <button key={a} type="button" onClick={() => toggleAccess(a)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  access.has(a) ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>{a}</button>
            ))}
          </div>

          {/* Estimated time on site — feeds the pricing (hours × rate). */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Estimated time on site</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <select value={durHours} onChange={(e) => setDurHours(e.target.value)} className={`w-full ${numInput}`} aria-label="Hours on site">
                  <option value="">Hours</option>
                  {HOUR_OPTS.map((h) => <option key={h} value={h}>{h} h</option>)}
                </select>
              </div>
              <div className="flex-1">
                <select value={durMins} onChange={(e) => setDurMins(e.target.value)} className={`w-full ${numInput}`} aria-label="Minutes on site">
                  <option value="">Minutes</option>
                  {MIN_OPTS.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </div>
            {enteredHours > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">Used for the estimate instead of the AI's hour guess.</p>
            )}
          </div>

          {/* Preferred days — client-facing availability. */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Preferred days to visit</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    preferredDays.has(d) ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Multiple visits — multiplies the per-visit estimate. */}
          <div>
            <button type="button" onClick={() => setMultiVisit((v) => !v)}
              className="flex items-center justify-between w-full text-left">
              <span className="text-[11px] text-gray-500">This job needs multiple visits</span>
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${multiVisit ? 'bg-secondary-500' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${multiVisit ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </button>
            {multiVisit && (
              <div className="flex items-center gap-2 mt-2">
                <select value={visitCount} onChange={(e) => setVisitCount(e.target.value)} className={numInput} aria-label="Number of visits">
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} visits</option>)}
                </select>
                <span className="text-xs text-gray-400">over a few</span>
                <select value={visitSpan} onChange={(e) => setVisitSpan(e.target.value)} className={numInput} aria-label="Visit span">
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
              </div>
            )}
          </div>

          {/* Materials */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setClientSupplies((v) => !v)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white border-gray-200 text-gray-600 hover:bg-gray-50">
              Materials: <span className="font-semibold">{clientSupplies ? 'client supplies' : 'I supply'}</span>
            </button>
          </div>

          {/* Site photos — wrap across rows; count shows remaining capacity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Site photos</span>
              <span className="text-xs text-gray-400 tabular-nums">{photos.length}/{MAX_PHOTOS} photos</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="absolute -top-1 -right-1 bg-white rounded-full border border-gray-200 p-0.5"><X className="w-2.5 h-2.5 text-gray-500" /></button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 border border-dashed border-gray-300 rounded-lg text-[10px] text-gray-500 cursor-pointer hover:bg-gray-50">
                  <Camera className="w-4 h-4" /> Add
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
                </label>
              )}
            </div>
          </div>

          {/* Anonymised area market range — Pro/PM see the numbers; free tier a
              subtle teaser, and only when there's enough data (≥5 quotes). */}
          {areaRange && areaRange.low != null && areaRange.high != null && (
            isPaidTier ? (
              <div className="flex items-start gap-2 rounded-lg bg-secondary-50 border border-secondary-100 px-3 py-2">
                <BarChart3 className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary-600" />
                <p className="text-xs text-secondary-800">
                  Market range for {property.toLowerCase()} {trade.toLowerCase()} in this area:{' '}
                  <span className="font-semibold">{money(areaRange.low)}–{money(areaRange.high)}</span>
                  {areaRange.mid != null && <span className="text-secondary-600"> · typically {money(areaRange.mid)}</span>}
                  <span className="block text-[11px] text-secondary-600/80 mt-0.5">Anonymised from {areaRange.sampleSize} nearby quotes — a guide, not a target.</span>
                </p>
              </div>
            ) : (
              <Link to="/pricing" className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 hover:bg-gray-50 transition-colors">
                <BarChart3 className="w-4 h-4 flex-shrink-0 text-gray-400" />
                <span className="text-[11px] text-gray-500"><span className="font-medium text-gray-700">See what {trade.toLowerCase()}s charge in this area</span> — market price ranges are a Pro feature.</span>
              </Link>
            )
          )}

          {/* History anchors — your own recent accepted quotes, with context */}
          {history.length > 0 && (
            <div className="text-[11px] text-gray-500">
              <span className="text-gray-400">Anchored to your recent quotes</span>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {history.slice(0, 4).map((h, i) => (
                  <span key={i} className="tabular-nums">
                    <span className="font-medium text-gray-700">{money(h.price)}</span>
                    <span className="text-gray-400"> · {h.title}{h.date ? ` · ${shortDate(h.date)}` : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Economics (collapsible) */}
          <div className="border border-gray-200 rounded-lg bg-white">
            <button type="button" onClick={() => setEconOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700">
              <span>Your rates {rate ? `· ${money(Number(rate))}/h` : ''}{profile?.is_gst_registered ? ' · GST' : ''}{travelKm ? ` · ~${travelKm} km` : ''}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${econOpen ? 'rotate-180' : ''}`} />
            </button>
            {econOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-3 pb-3">
                <div><label className="block text-[11px] text-gray-500 mb-0.5">Rate $/h</label><input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[11px] text-gray-500 mb-0.5">Workers</label><input type="number" min="1" value={workers} onChange={(e) => setWorkers(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[11px] text-gray-500 mb-0.5">Margin %</label><input type="number" min="0" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[11px] text-gray-500 mb-0.5">Materials markup %</label><input type="number" min="0" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[11px] text-gray-500 mb-0.5">Call-out $</label><input type="number" min="0" value={callOut} onChange={(e) => setCallOut(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div className="flex items-end text-[11px] text-gray-500 pb-2">GST: {profile?.is_gst_registered ? 'registered' : 'not registered'}</div>
              </div>
            )}
          </div>

          {aiLimitReached || aiBlocked ? (
            /* Out of estimates — Pro is the prominent option, the pack is secondary. */
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Out of free estimates this month</p>
                  <p className="text-xs text-gray-500 mt-0.5">Go Pro for unlimited, grab a top-up pack, or just enter your price manually below.</p>
                </div>
              </div>

              {/* Primary: Go Pro */}
              <Link to="/pricing" className="block rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-emerald-800">Go Pro — unlimited estimates</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold uppercase tracking-wide">Best value</span>
                    </div>
                    <p className="text-xs text-emerald-700 mt-0.5">${TIER_PRICING.pro.monthly}/mo · unlimited AI estimates + lower platform fees</p>
                  </div>
                  <span className="text-emerald-700 text-lg" aria-hidden="true">→</span>
                </div>
              </Link>

              {/* Secondary: buy a pack */}
              <button type="button" onClick={buyPack} disabled={buyingPack}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 transition-colors">
                <span className="text-sm font-medium text-gray-700">
                  {buyingPack ? 'Starting checkout…' : 'Get 20 more — $4.99'}
                  <span className="block text-[11px] text-gray-400 font-normal">One-time top-up · credits don’t expire</span>
                </span>
                {buyingPack ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
            </div>
          ) : (
            <button type="button" onClick={runEstimate} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary-600 text-white text-sm font-semibold rounded-lg hover:bg-secondary-700 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Estimate
            </button>
          )}
          {aiUsage && aiUsage.limit != null && !aiLimitReached && aiTotalRemaining !== null && (
            <p className="text-[11px] text-gray-500 text-center">
              {aiPackRemaining > 0
                ? `${aiTotalRemaining} estimate${aiTotalRemaining === 1 ? '' : 's'} remaining (${aiMonthlyRemaining} monthly + ${aiPackRemaining} pack credit${aiPackRemaining === 1 ? '' : 's'})`
                : `${aiMonthlyRemaining}/${aiUsage.limit} free estimates this month`}
            </p>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Result — editable line items */}
      {result && priced && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${CONF_CHIP[result.confidence]}`}>{result.confidence} confidence</span>
              <span className="text-[11px] text-gray-400">{result.source === 'ai' ? 'AI' : 'estimate'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Hours{visits > 1 ? '/visit' : ''}</span>
              {enteredHours > 0 ? (
                <span className="font-semibold text-gray-700 tabular-nums">{enteredHours % 1 === 0 ? enteredHours : enteredHours.toFixed(2)}</span>
              ) : (
                <input type="number" min="0" step="0.5" value={hoursEdit} onChange={(e) => setHoursEdit(e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-sm" />
              )}
            </div>
          </div>

          {result.needsSiteVisit && (
            <div className="flex items-start gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
              Low confidence — a site visit is recommended before committing to a firm price.
            </div>
          )}

          {/* Line items */}
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {priced.items.map((li, i) => (
              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 text-sm">
                <span className="text-gray-700">{li.label}{li.detail && <span className="text-gray-400 text-xs"> · {li.detail}</span>}</span>
                <span className="font-medium text-gray-900 tabular-nums">{money(li.amount)}</span>
              </div>
            ))}
            {priced.gst > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 text-sm">
                <span className="text-gray-500">GST 10%</span><span className="text-gray-700 tabular-nums">{money(priced.gst)}</span>
              </div>
            )}
            {visits > 1 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 text-sm bg-secondary-50">
                <span className="text-secondary-700">Per visit × {visits} visits</span>
                <span className="text-secondary-700 tabular-nums">{money(priced.perVisitTotal)} × {visits}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-2.5 py-2 bg-gray-50">
              <span className="font-semibold text-gray-900">Total{visits > 1 ? ` (${visits} visits)` : ''}</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">{money(priced.total)}</span>
            </div>
          </div>

          {result.assumptions.length > 0 && (
            <ul className="space-y-0.5">
              {result.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600"><Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" /> {a}</li>
              ))}
            </ul>
          )}

          {result.sharpeningQuestions.length > 0 && (
            <div className="text-xs text-gray-600 space-y-0.5">
              <p className="font-medium text-gray-700">Answer these to tighten it, then re-estimate:</p>
              {result.sharpeningQuestions.map((qn, i) => (
                <p key={i} className="flex items-start gap-1.5"><HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-secondary-500" /> {qn}</p>
              ))}
            </div>
          )}

          <button type="button" onClick={applyResult}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-warm-500 text-white text-sm font-semibold rounded-lg hover:bg-warm-600 transition-colors">
            <Check className="w-4 h-4" /> Use {money(priced.total)}
          </button>
        </div>
      )}
    </div>
  );
}
