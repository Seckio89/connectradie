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
import { Sparkles, Loader2, Camera, X, AlertTriangle, Check, Info, ChevronDown, HelpCircle, Lock, Package, BarChart3, Plus, Send, Video } from 'lucide-react';
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
// workstations/toilets/area, not "rooms and bathrooms". End of lease gets its
// own category (one of the most common cleaning jobs in Australia) with
// bedrooms/bathrooms + inclusion toggles rather than generic residential fields.
const PROPERTY_TYPES = ['Residential', 'End of lease', 'Office', 'Retail', 'Childcare', 'Warehouse', 'Strata / common areas'];

// End-of-lease inclusions — yes/no toggles that sharpen the estimate.
const EOL_EXTRAS = ['Kitchen', 'Garage', 'Oven clean', 'Carpet steam clean', 'Window clean', 'Balcony / outdoor area'];

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
  'Cleaning|End of lease': [{ key: 'bedrooms', label: 'Bedrooms' }, { key: 'bathrooms', label: 'Bathrooms' }, { key: 'sqm', label: 'Area m²' }],
  'Cleaning|Office': [{ key: 'workstations', label: 'Workstations' }, { key: 'toilets', label: 'Toilets' }, { key: 'sqm', label: 'Area m²' }],
  'Cleaning|Retail': [{ key: 'sqm', label: 'Floor m²' }, { key: 'toilets', label: 'Toilets' }],
  'Cleaning|Childcare': [{ key: 'rooms', label: 'Activity rooms' }, { key: 'toilets', label: 'Toilets' }, { key: 'sqm', label: 'Floor m²' }],
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
  high: 'bg-ct-teal/[0.14] text-ct-teal',
  medium: 'bg-ct-surface-2 text-ct-mute-2',
  low: 'bg-ct-amber/[0.13] text-ct-amber',
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

// Pull evenly-spaced still frames from a video entirely on-device, so a tradie
// can film a quick walk-around instead of lining up many photos. Only the
// resulting frames (resized JPEGs, same shape as photos) are ever uploaded —
// the video file itself never leaves the phone.
function videoToFrames(file: File, count = 6): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    const frames: string[] = [];
    const cleanup = () => URL.revokeObjectURL(url);

    const grab = (time: number) => new Promise<void>((res) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        const maxDim = 1280;
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try { frames.push(canvas.toDataURL('image/jpeg', 0.8)); } catch { /* skip frame */ }
        }
        res();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });

    video.onloadedmetadata = async () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!duration) { cleanup(); resolve([]); return; }
      // Sample between ~5% and ~95% of the clip to skip black start/end frames.
      const start = duration * 0.05;
      const span = duration * 0.9;
      const n = Math.max(1, count);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? duration / 2 : start + (span * i) / (n - 1);
        // eslint-disable-next-line no-await-in-loop
        await grab(Math.min(duration - 0.01, Math.max(0, t)));
      }
      cleanup();
      resolve(frames);
    };
    video.onerror = () => { cleanup(); resolve([]); };
    video.src = url;
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
  // End-of-lease inclusion toggles (only shown/used when property = End of lease).
  const [eolExtras, setEolExtras] = useState<Set<string>>(new Set());
  const [durHours, setDurHours] = useState('');
  const [durMins, setDurMins] = useState('');
  const [preferredDays, setPreferredDays] = useState<Set<string>>(new Set());
  const [multiVisit, setMultiVisit] = useState(false);
  const [visitCount, setVisitCount] = useState('2');
  const [visitSpan, setVisitSpan] = useState('weeks');
  const [clientSupplies, setClientSupplies] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const MAX_PHOTOS = 15;

  const [econOpen, setEconOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [workers, setWorkers] = useState('1');
  // How the on-site hours are counted when there's a crew: 'perCleaner' bills
  // each worker for the full time (hours × crew); 'combined' bills the crew's
  // shared total (hours only, not multiplied). Tradie picks per quote.
  const [hoursMode, setHoursMode] = useState<'perCleaner' | 'combined'>('perCleaner');
  const [marginPct, setMarginPct] = useState('15');
  const [markupPct, setMarkupPct] = useState('20');
  const [callOut, setCallOut] = useState('');

  const [history, setHistory] = useState<{ price: number; title: string; date: string | null }[]>([]);
  const [hoursEdit, setHoursEdit] = useState('');
  const [materialsEdit, setMaterialsEdit] = useState('');

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
    // != null, not truthy: a saved default of 0 means this tradie offers free
    // visits, and should prefill as 0 rather than reading as "no default".
    else if (tradieDetails?.default_call_out_fee_cents != null) setCallOut(String(Math.round(tradieDetails.default_call_out_fee_cents / 100)));
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

  const toggleEolExtra = (x: string) => setEolExtras((prev) => {
    const next = new Set(prev); next.has(x) ? next.delete(x) : next.add(x); return next;
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

  // Video → still frames, extracted on-device, then added to the photo set so
  // they feed the estimate exactly like photos. The clip is never uploaded.
  const handleVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const slots = MAX_PHOTOS - photos.length;
    if (slots <= 0) return;
    setVideoProcessing(true);
    try {
      const frames = await videoToFrames(file, Math.min(6, slots));
      if (frames.length) setPhotos((prev) => [...prev, ...frames].slice(0, MAX_PHOTOS));
    } catch { /* skip */ }
    setVideoProcessing(false);
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
          notes: [
            trade === 'Other' ? customTask.trim() : '',
            property === 'End of lease' && eolExtras.size > 0 ? `End of lease inclusions: ${[...eolExtras].join(', ')}` : '',
            notes.trim(),
          ].filter(Boolean).join(' — ') || undefined,
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
        setMaterialsEdit(String(est.materialsCost));
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
    // Tradie can override the AI's materials figure; blank falls back to the AI's.
    const mats = materialsEdit !== '' ? (Number(materialsEdit) || 0) : result.materialsCost;
    // 'combined' = the crew shares the entered hours, so don't multiply labour
    // by headcount; 'perCleaner' keeps the full hours × crew (each on site).
    const labourEconomics = hoursMode === 'combined' ? { ...economics, workers: 1 } : economics;
    const per = computePrice(hours, mats, labourEconomics, clientSupplies);
    return { ...per, perVisitTotal: per.total, total: per.total * visits, visits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hoursEdit, materialsEdit, enteredHours, visits, rate, workers, hoursMode, marginPct, markupPct, callOut, clientSupplies, travelKm, profile?.is_gst_registered]);

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
  const numInput = 'px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal';

  return (
    <div className="border border-ct-line bg-ct-surface-2/40 rounded-ct-md p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-ct-mute-2" />
        <span className="text-sm font-semibold text-ct-paper">Pricing helper</span>
        <span className="text-[0.6875rem] text-ct-mute">suggests — you decide</span>
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
              trade === t ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
            }`}>{t}</button>
        ))}
      </div>

      {trade && (
        <>
          {/* "Other" trade — capture the task in words + feed the review pipeline */}
          {trade === 'Other' && (
            <div className="rounded-ct-sm border border-ct-line bg-ct-surface p-3 space-y-2">
              <label className="block text-xs font-medium text-ct-mute-2">What type of work? Describe the task</label>
              <div className="flex items-center gap-2">
                <input type="text" value={customTask}
                  onChange={(e) => { setCustomTask(e.target.value); setTaskSubmitted(false); }}
                  placeholder="e.g. Pressure washing, gutter vac, solar panel clean…"
                  className={`flex-1 ${numInput}`} />
                <button type="button" onClick={submitTask} disabled={taskSubmitting || customTask.trim().length < 2}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-ct-sm bg-ct-teal text-ct-ink text-xs font-medium hover:bg-ct-teal-deep disabled:opacity-50">
                  {taskSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Suggest
                </button>
              </div>
              {taskSubmitted
                ? <p className="text-[0.6875rem] text-ct-teal flex items-center gap-1"><Check className="w-3 h-3" /> Thanks — we’ll review this and may add it as a category.</p>
                : <p className="text-[0.6875rem] text-ct-mute">Can’t see your trade? Tell us and we’ll add popular requests. Your description also sharpens the estimate.</p>}
              {approvedTasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {approvedTasks.map((t) => (
                    <button key={t} type="button" onClick={() => setCustomTask(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2">
                      <Plus className="w-3 h-3" /> {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Property type — reshapes the quantity questions (office/warehouse ≠ rooms) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] text-ct-mute">Property:</span>
            {PROPERTY_TYPES.map((p) => (
              <button key={p} type="button" onClick={() => { setProperty(p); setQuantities({}); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  property === p ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                }`}>{p}</button>
            ))}
          </div>

          {/* Trade-specific quantities */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-[0.6875rem] text-ct-mute mb-0.5">{f.label}</label>
                <input type="number" min="0" value={quantities[f.key] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [f.key]: e.target.value }))}
                  className={`w-full ${numInput}`} />
              </div>
            ))}
          </div>

          {/* End-of-lease inclusions — yes/no toggles per bond-clean staple */}
          {property === 'End of lease' && (
            <div>
              <span className="block text-[0.6875rem] text-ct-mute mb-1">Included in this clean:</span>
              <div className="flex flex-wrap gap-1.5">
                {EOL_EXTRAS.map((x) => (
                  <button key={x} type="button" onClick={() => toggleEolExtra(x)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      eolExtras.has(x) ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                    }`}>{x}</button>
                ))}
              </div>
            </div>
          )}

          {/* Condition */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] text-ct-mute">Condition:</span>
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => setCondition(condition === c ? '' : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                  condition === c ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                }`}>{c}</button>
            ))}
          </div>

          {/* Access */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] text-ct-mute">Access:</span>
            {ACCESS.map((a) => (
              <button key={a} type="button" onClick={() => toggleAccess(a)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  access.has(a) ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                }`}>{a}</button>
            ))}
          </div>

          {/* Estimated time on site — feeds the pricing (hours × rate). */}
          <div>
            <label className="block text-[0.6875rem] text-ct-mute mb-1">Estimated time on site</label>
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
              <p className="text-[0.6875rem] text-ct-mute mt-1">Used for the estimate instead of the AI's hour guess.</p>
            )}
          </div>

          {/* Crew size + how the on-site hours are counted (per-worker vs combined) */}
          <div>
            <label className="block text-[0.6875rem] text-ct-mute mb-1">Workers on site</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="number" min="1" value={workers}
                onChange={(e) => setWorkers(e.target.value)}
                className={`w-20 ${numInput}`} aria-label="Number of workers on site" />
              {Number(workers) > 1 && (
                <div className="inline-flex rounded-ct-sm border border-ct-line overflow-hidden text-xs">
                  <button type="button" onClick={() => setHoursMode('perCleaner')}
                    className={`px-2.5 py-2 font-medium transition-colors ${hoursMode === 'perCleaner' ? 'bg-ct-surface-2 text-ct-mute-2' : 'bg-ct-surface text-ct-mute-2 hover:bg-ct-surface-2'}`}>
                    Hours each
                  </button>
                  <button type="button" onClick={() => setHoursMode('combined')}
                    className={`px-2.5 py-2 font-medium border-l border-ct-line transition-colors ${hoursMode === 'combined' ? 'bg-ct-surface-2 text-ct-mute-2' : 'bg-ct-surface text-ct-mute-2 hover:bg-ct-surface-2'}`}>
                    Combined total
                  </button>
                </div>
              )}
            </div>
            {Number(workers) > 1 && (
              <p className="text-[0.6875rem] text-ct-mute mt-1">
                {hoursMode === 'combined'
                  ? `${workers} workers share the hours — labour billed as the combined time, not multiplied.`
                  : `Each of the ${workers} workers is on site for the full time — labour = hours × ${workers}.`}
              </p>
            )}
          </div>

          {/* Preferred days — client-facing availability. */}
          <div>
            <label className="block text-[0.6875rem] text-ct-mute mb-1">Preferred days to visit</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    preferredDays.has(d) ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                  }`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Multiple visits — multiplies the per-visit estimate. */}
          <div>
            <button type="button" onClick={() => setMultiVisit((v) => !v)}
              className="flex items-center justify-between w-full text-left">
              <span className="text-[0.6875rem] text-ct-mute">This job needs multiple visits</span>
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${multiVisit ? 'bg-ct-surface-2' : 'bg-ct-line'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-ct-surface transition-transform ${multiVisit ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </button>
            {multiVisit && (
              <div className="flex items-center gap-2 mt-2">
                <select value={visitCount} onChange={(e) => setVisitCount(e.target.value)} className={numInput} aria-label="Number of visits">
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} visits</option>)}
                </select>
                <span className="text-xs text-ct-mute">over a few</span>
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
              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2">
              Materials: <span className="font-semibold">{clientSupplies ? 'client supplies' : 'I supply'}</span>
            </button>
          </div>

          {/* Site photos — wrap across rows; count shows remaining capacity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-ct-mute">Site photos or video</span>
              <span className="text-xs text-ct-mute tabular-nums">{photos.length}/{MAX_PHOTOS} photos</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative w-14 h-14 rounded-ct-sm overflow-hidden border border-ct-line">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="absolute -top-1 -right-1 bg-ct-surface rounded-full border border-ct-line p-0.5"><X className="w-2.5 h-2.5 text-ct-mute" /></button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 border border-dashed border-ct-line rounded-ct-sm text-[0.625rem] text-ct-mute cursor-pointer hover:bg-ct-surface-2">
                  <Camera className="w-4 h-4" /> Add
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
                </label>
              )}
              {photos.length < MAX_PHOTOS && (
                <label className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 border border-dashed border-ct-line rounded-ct-sm text-[0.625rem] text-ct-mute cursor-pointer hover:bg-ct-surface-2 ${videoProcessing ? 'opacity-60 pointer-events-none' : ''}`}>
                  {videoProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  {videoProcessing ? 'Frames…' : 'Video'}
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideo} disabled={videoProcessing} />
                </label>
              )}
            </div>
            <p className="text-[0.6875rem] text-ct-mute mt-1.5">Add a short walk-around video — we’ll pull the key frames on your device to help estimate. The video isn’t uploaded.</p>
          </div>

          {/* Anonymised area market range — Pro/PM see the numbers; free tier a
              subtle teaser, and only when there's enough data (≥5 quotes). */}
          {areaRange && areaRange.low != null && areaRange.high != null && (
            isPaidTier ? (
              <div className="flex items-start gap-2 rounded-ct-sm bg-ct-surface-2 border border-ct-line px-3 py-2">
                <BarChart3 className="w-4 h-4 mt-0.5 flex-shrink-0 text-ct-mute-2" />
                <p className="text-xs text-ct-mute-2">
                  Market range for {property.toLowerCase()} {trade.toLowerCase()} in this area:{' '}
                  <span className="font-semibold">{money(areaRange.low)}–{money(areaRange.high)}</span>
                  {areaRange.mid != null && <span className="text-ct-mute-2"> · typically {money(areaRange.mid)}</span>}
                  <span className="block text-[0.6875rem] text-ct-mute-2/80 mt-0.5">Anonymised from {areaRange.sampleSize} nearby quotes — a guide, not a target.</span>
                </p>
              </div>
            ) : (
              <Link to="/pricing" className="flex items-center gap-2 rounded-ct-sm border border-dashed border-ct-line bg-ct-surface px-3 py-2 hover:bg-ct-surface-2 transition-colors">
                <BarChart3 className="w-4 h-4 flex-shrink-0 text-ct-mute" />
                <span className="text-[0.6875rem] text-ct-mute"><span className="font-medium text-ct-mute-2">See what {trade.toLowerCase()}s charge in this area</span> — market price ranges are a Pro feature.</span>
              </Link>
            )
          )}

          {/* History anchors — your own recent accepted quotes, with context */}
          {history.length > 0 && (
            <div className="text-[0.6875rem] text-ct-mute">
              <span className="text-ct-mute">Anchored to your recent quotes</span>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {history.slice(0, 4).map((h, i) => (
                  <span key={i} className="tabular-nums">
                    <span className="font-medium text-ct-mute-2">{money(h.price)}</span>
                    <span className="text-ct-mute"> · {h.title}{h.date ? ` · ${shortDate(h.date)}` : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Economics (collapsible) */}
          <div className="border border-ct-line rounded-ct-sm bg-ct-surface">
            <button type="button" onClick={() => setEconOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-ct-mute-2">
              <span>Your rates {rate ? `· ${money(Number(rate))}/h` : ''}{profile?.is_gst_registered ? ' · GST' : ''}{travelKm ? ` · ~${travelKm} km` : ''}</span>
              <ChevronDown className={`w-4 h-4 text-ct-mute transition-transform ${econOpen ? 'rotate-180' : ''}`} />
            </button>
            {econOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-3 pb-3">
                <div><label className="block text-[0.6875rem] text-ct-mute mb-0.5">Rate $/h</label><input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[0.6875rem] text-ct-mute mb-0.5">Workers</label><input type="number" min="1" value={workers} onChange={(e) => setWorkers(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[0.6875rem] text-ct-mute mb-0.5">Margin %</label><input type="number" min="0" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[0.6875rem] text-ct-mute mb-0.5">Materials markup %</label><input type="number" min="0" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div><label className="block text-[0.6875rem] text-ct-mute mb-0.5">Call-out $</label><input type="number" min="0" value={callOut} onChange={(e) => setCallOut(e.target.value)} className={`w-full ${numInput}`} /></div>
                <div className="flex items-end text-[0.6875rem] text-ct-mute pb-2">GST: {profile?.is_gst_registered ? 'registered' : 'not registered'}</div>
              </div>
            )}
          </div>

          {/* Extra details — free text fed to the AI. Answer the sharpening
              questions here, then Estimate again to tighten the quote. */}
          <div>
            <label className="block text-[0.6875rem] text-ct-mute mb-1">Add details to sharpen the estimate (optional)</label>
            <textarea value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight, 120)}px`; }}
              rows={5}
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              placeholder="e.g. one-off deep clean, no carpets, after-hours access only, before a health inspection"
              className={`w-full ${numInput} resize-y min-h-[120px] leading-relaxed`} />
            {result && result.sharpeningQuestions.length > 0 && (
              <p className="text-[0.6875rem] text-ct-mute mt-1">Answer the questions below here, then tap Estimate again.</p>
            )}
          </div>

          {aiLimitReached || aiBlocked ? (
            /* Out of estimates — Pro is the prominent option, the pack is secondary. */
            <div className="rounded-ct-md border border-ct-line bg-ct-surface p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-ct-mute" />
                <div>
                  <p className="text-sm font-semibold text-ct-paper">Out of free estimates this month</p>
                  <p className="text-xs text-ct-mute mt-0.5">Go Pro for unlimited, grab a top-up pack, or just enter your price manually below.</p>
                </div>
              </div>

              {/* Primary: Go Pro */}
              <Link to="/pricing" className="block rounded-ct-sm border-2 border-ct-teal bg-ct-teal/[0.14] p-3 hover:bg-ct-teal/[0.14] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-ct-teal">Go Pro — unlimited estimates</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-ct-teal text-ct-ink text-[0.625rem] font-semibold uppercase tracking-wide">Best value</span>
                    </div>
                    <p className="text-xs text-ct-teal mt-0.5">${TIER_PRICING.pro.monthly}/mo · unlimited AI estimates + lower platform fees</p>
                  </div>
                  <span className="text-ct-teal text-lg" aria-hidden="true">→</span>
                </div>
              </Link>

              {/* Secondary: buy a pack */}
              <button type="button" onClick={buyPack} disabled={buyingPack}
                className="w-full flex items-center justify-between gap-2 rounded-ct-sm border border-ct-line bg-ct-surface px-3 py-2 text-left hover:bg-ct-surface-2 disabled:opacity-50 transition-colors">
                <span className="text-sm font-medium text-ct-mute-2">
                  {buyingPack ? 'Starting checkout…' : 'Get 20 more — $4.99'}
                  <span className="block text-[0.6875rem] text-ct-mute font-normal">One-time top-up · credits don’t expire</span>
                </span>
                {buyingPack ? <Loader2 className="w-4 h-4 animate-spin text-ct-mute" /> : <Package className="w-4 h-4 text-ct-mute flex-shrink-0" />}
              </button>
            </div>
          ) : (
            <button type="button" onClick={runEstimate} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:bg-ct-teal-deep disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Estimate
            </button>
          )}
          {aiUsage && aiUsage.limit != null && !aiLimitReached && aiTotalRemaining !== null && (
            <p className="text-[0.6875rem] text-ct-mute text-center">
              {aiPackRemaining > 0
                ? `${aiTotalRemaining} estimate${aiTotalRemaining === 1 ? '' : 's'} remaining (${aiMonthlyRemaining} monthly + ${aiPackRemaining} pack credit${aiPackRemaining === 1 ? '' : 's'})`
                : `${aiMonthlyRemaining}/${aiUsage.limit} free estimates this month`}
            </p>
          )}
        </>
      )}

      {error && <p className="text-xs text-ct-rose">{error}</p>}

      {/* Result — editable line items */}
      {result && priced && (
        <div className="bg-ct-surface border border-ct-line rounded-ct-sm p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[0.6875rem] font-medium ${CONF_CHIP[result.confidence]}`}>{result.confidence} confidence</span>
              <span className="text-[0.6875rem] text-ct-mute">{result.source === 'ai' ? 'AI' : 'estimate'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ct-mute">
              <span>Hours{visits > 1 ? '/visit' : ''}</span>
              {enteredHours > 0 ? (
                <span className="font-semibold text-ct-mute-2 tabular-nums">{enteredHours % 1 === 0 ? enteredHours : enteredHours.toFixed(2)}</span>
              ) : (
                <input type="number" min="0" step="0.5" value={hoursEdit} onChange={(e) => setHoursEdit(e.target.value)} className="w-16 px-2 py-1 border border-ct-line rounded-ct-xs text-sm" />
              )}
            </div>
          </div>

          {!clientSupplies && (
            <div className="flex items-center justify-end gap-1.5 text-xs text-ct-mute">
              <span>Materials $</span>
              <input type="number" min="0" value={materialsEdit} onChange={(e) => setMaterialsEdit(e.target.value)}
                className="w-20 px-2 py-1 border border-ct-line rounded-ct-xs text-sm" aria-label="Materials cost" />
              <span className="text-[0.6875rem] text-ct-mute">edit if it’s off</span>
            </div>
          )}

          {result.needsSiteVisit && (
            <div className="flex items-start gap-1.5 text-xs bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm px-2.5 py-1.5 text-ct-paper">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ct-amber" />
              Low confidence — a site visit is recommended before committing to a firm price.
            </div>
          )}

          {/* Line items */}
          <div className="divide-y divide-ct-line-soft border border-ct-line-soft rounded-ct-sm">
            {priced.items.map((li, i) => (
              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 text-sm">
                <span className="text-ct-mute-2">{li.label}{li.detail && <span className="text-ct-mute text-xs"> · {li.detail}</span>}</span>
                <span className="font-medium text-ct-paper tabular-nums">{money(li.amount)}</span>
              </div>
            ))}
            {priced.gst > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 text-sm">
                <span className="text-ct-mute">GST 10%</span><span className="text-ct-mute-2 tabular-nums">{money(priced.gst)}</span>
              </div>
            )}
            {visits > 1 && (
              <div className="flex items-center justify-between px-2.5 py-1.5 text-sm bg-ct-surface-2">
                <span className="text-ct-mute-2">Per visit × {visits} visits</span>
                <span className="text-ct-mute-2 tabular-nums">{money(priced.perVisitTotal)} × {visits}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-2.5 py-2 bg-ct-surface-2">
              <span className="font-semibold text-ct-paper">Total{visits > 1 ? ` (${visits} visits)` : ''}</span>
              <span className="text-lg font-bold text-ct-paper tabular-nums">{money(priced.total)}</span>
            </div>
          </div>

          {result.assumptions.length > 0 && (
            <ul className="space-y-0.5">
              {result.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-ct-mute-2"><Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-ct-mute" /> {a}</li>
              ))}
            </ul>
          )}

          {result.sharpeningQuestions.length > 0 && (
            <div className="text-xs text-ct-mute-2 space-y-0.5">
              <p className="font-medium text-ct-mute-2">Answer these to tighten it, then re-estimate:</p>
              {result.sharpeningQuestions.map((qn, i) => (
                <p key={i} className="flex items-start gap-1.5"><HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-ct-mute-2" /> {qn}</p>
              ))}
            </div>
          )}

          <button type="button" onClick={applyResult}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 transition-colors">
            <Check className="w-4 h-4" /> Use {money(priced.total)}
          </button>
        </div>
      )}
    </div>
  );
}
