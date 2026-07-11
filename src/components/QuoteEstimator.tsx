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

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Loader2, Camera, X, AlertTriangle, Check, Info, ChevronDown, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateDistance } from '../hooks/useGeolocation';
import type { ClientContact } from '../types/database';

interface QuoteEstimatorProps {
  onApply: (price: number, summary: string) => void;
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
  const travel = e.travelKm > 0 ? Math.round(e.travelKm * 0.6) : 0;
  const callOut = e.callOutFee + travel;
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
  const [clientSupplies, setClientSupplies] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [econOpen, setEconOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [workers, setWorkers] = useState('1');
  const [marginPct, setMarginPct] = useState('15');
  const [markupPct, setMarkupPct] = useState('20');
  const [callOut, setCallOut] = useState('');

  const [history, setHistory] = useState<{ price: number; title: string }[]>([]);
  const [hoursEdit, setHoursEdit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WorkEstimate | null>(null);

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
        .select('firm_price, price_min, jobs(title)')
        .eq('tradie_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(6);
      const rows = (data as unknown as { firm_price: number | null; price_min: number | null; jobs: { title: string | null } | null }[]) ?? [];
      setHistory(rows
        .map((r) => ({ price: r.firm_price ?? r.price_min ?? 0, title: r.jobs?.title ?? 'Job' }))
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

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4 - photos.length);
    for (const f of files) {
      try { const url = await fileToDataUrl(f); setPhotos((prev) => (prev.length < 4 ? [...prev, url] : prev)); } catch { /* skip */ }
    }
    e.target.value = '';
  };

  const runEstimate = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('estimate-quote', {
        body: {
          trade: trade.toLowerCase(),
          jobType: property.toLowerCase(),
          quantities: Object.fromEntries(Object.entries(quantities).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
          condition: condition || undefined,
          access: [...access],
          materialsSuppliedBy: clientSupplies ? 'client' : 'tradie',
          notes: notes.trim() || undefined,
          economics,
          history,
          images: photos,
        },
      });
      if (fnError || data?.error) {
        setError(data?.error || 'Could not generate an estimate. Please try again.');
      } else {
        const est = data as WorkEstimate;
        setResult(est);
        setHoursEdit(String(est.hours));
      }
    } catch { setError('Could not generate an estimate. Please try again.'); }
    setLoading(false);
  };

  // Live price from the (editable) hours + economics.
  const priced = useMemo(() => {
    if (!result) return null;
    const hours = Number(hoursEdit) || result.hours;
    return computePrice(hours, result.materialsCost, economics, clientSupplies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hoursEdit, rate, workers, marginPct, markupPct, callOut, clientSupplies, travelKm, profile?.is_gst_registered]);

  const applyResult = () => {
    if (!result || !priced) return;
    const summary =
      `Estimated ${hoursEdit || result.hours} h · ${money(priced.total)}` +
      (result.assumptions.length ? `\nAssumptions: ${result.assumptions.join(' ')}` : '');
    onApply(Math.round(priced.total), summary);
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

          {/* Materials + photos */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setClientSupplies((v) => !v)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white border-gray-200 text-gray-600 hover:bg-gray-50">
              Materials: <span className="font-semibold">{clientSupplies ? 'client supplies' : 'I supply'}</span>
            </button>
            {photos.map((p, i) => (
              <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 bg-white rounded-full border border-gray-200 p-0.5"><X className="w-2.5 h-2.5 text-gray-500" /></button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
                <Camera className="w-3.5 h-3.5" /> Photo
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
              </label>
            )}
          </div>

          {/* History anchors */}
          {history.length > 0 && (
            <p className="text-[11px] text-gray-500">
              Anchored to your recent quotes: {history.slice(0, 4).map((h) => money(h.price)).join(' · ')}
            </p>
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

          <button type="button" onClick={runEstimate} disabled={loading}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary-600 text-white text-sm font-semibold rounded-lg hover:bg-secondary-700 disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Estimate
          </button>
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
              <span>Hours</span>
              <input type="number" min="0" step="0.5" value={hoursEdit} onChange={(e) => setHoursEdit(e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-sm" />
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
            <div className="flex items-center justify-between px-2.5 py-2 bg-gray-50">
              <span className="font-semibold text-gray-900">Total</span>
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
