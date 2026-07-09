// ─────────────────────────────────────────────────────────────────────────────
// QuoteEstimator — opt-in "advanced" AI pricing helper used inside the quote
// composer. The tradie answers a few questions (trade, size, scope) and can add
// photos; the estimate-quote edge function returns SUGGESTED hours + a price
// range (Claude vision when configured, deterministic heuristic otherwise).
// It only suggests — the tradie applies or ignores it. Licensed/variable trades
// get a wider range and a "book a site visit" nudge.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Sparkles, Loader2, Camera, X, AlertTriangle, Check, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Estimate {
  source: 'ai' | 'estimate';
  hours: number;
  priceMin: number;
  priceMax: number;
  confidence: 'low' | 'medium' | 'high';
  needsSiteVisit: boolean;
  assumptions: string[];
  note?: string;
}

interface QuoteEstimatorProps {
  /** Applied when the tradie accepts the suggestion: midpoint price + a summary line. */
  onApply: (price: number, summary: string) => void;
}

const SCOPE_OPTIONS = ['Deep / end-of-lease', 'Surface prep / repairs', 'Includes materials'];

const CONF_CHIP: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-secondary-100 text-secondary-700',
  low: 'bg-amber-100 text-amber-700',
};

// Downscale a photo to keep the request small (long edge ≤ 1280px, JPEG q0.8).
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

const money = (n: number) => `$${n.toLocaleString('en-AU')}`;

export default function QuoteEstimator({ onApply }: QuoteEstimatorProps) {
  const [trade, setTrade] = useState('');
  const [sqm, setSqm] = useState('');
  const [rooms, setRooms] = useState('');
  const [rate, setRate] = useState('');
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Estimate | null>(null);

  const toggleScope = (s: string) =>
    setScope((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
    for (const f of files) {
      try {
        const url = await fileToDataUrl(f);
        setPhotos((prev) => (prev.length < 3 ? [...prev, url] : prev));
      } catch { /* skip unreadable image */ }
    }
    e.target.value = '';
  };

  const runEstimate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('estimate-quote', {
        body: {
          trade: trade.trim() || undefined,
          sqm: sqm ? Number(sqm) : undefined,
          rooms: rooms ? Number(rooms) : undefined,
          scope: [...scope],
          hourlyRate: rate ? Number(rate) : undefined,
          images: photos,
        },
      });
      if (fnError || data?.error) {
        setError(data?.error || 'Could not generate an estimate. Please try again.');
      } else {
        setResult(data as Estimate);
      }
    } catch {
      setError('Could not generate an estimate. Please try again.');
    }
    setLoading(false);
  };

  const applyResult = () => {
    if (!result) return;
    const mid = Math.round((result.priceMin + result.priceMax) / 2);
    const summary =
      `Estimated ${result.hours}h · ${money(result.priceMin)}–${money(result.priceMax)}` +
      (result.assumptions.length ? `\nAssumptions: ${result.assumptions.join(' ')}` : '');
    onApply(mid, summary);
  };

  return (
    <div className="border border-secondary-200 bg-secondary-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-secondary-600" />
        <span className="text-sm font-semibold text-gray-900">Pricing helper</span>
        <span className="text-[11px] text-gray-500">suggests — you decide</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          type="text" value={trade} onChange={(e) => setTrade(e.target.value)}
          placeholder="Trade (e.g. cleaning)"
          className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="number" min="0" value={sqm} onChange={(e) => setSqm(e.target.value)}
          placeholder="sqm"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="number" min="0" value={rooms} onChange={(e) => setRooms(e.target.value)}
          placeholder="rooms"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SCOPE_OPTIONS.map((s) => (
          <button
            key={s} type="button" onClick={() => toggleScope(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              scope.has(s)
                ? 'bg-secondary-100 border-secondary-300 text-secondary-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)}
          placeholder="Your $/hr"
          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {photos.map((p, i) => (
          <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200">
            <img src={p} alt="" className="w-full h-full object-cover" />
            <button
              type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 bg-white rounded-full border border-gray-200 p-0.5"
            >
              <X className="w-2.5 h-2.5 text-gray-500" />
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <label className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
            <Camera className="w-3.5 h-3.5" /> Photo
            <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
          </label>
        )}
        <button
          type="button" onClick={runEstimate} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-secondary-600 text-white text-sm font-semibold rounded-lg hover:bg-secondary-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Estimate
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-gray-900">
                {money(result.priceMin)} – {money(result.priceMax)}
              </span>
              <span className="text-xs text-gray-500">~{result.hours}h</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${CONF_CHIP[result.confidence]}`}>
                {result.confidence} confidence
              </span>
              <span className="text-[11px] text-gray-400">{result.source === 'ai' ? 'AI' : 'estimate'}</span>
            </div>
          </div>

          {result.needsSiteVisit && (
            <div className="flex items-start gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
              A site visit is recommended before committing to a firm price.
            </div>
          )}

          {result.assumptions.length > 0 && (
            <ul className="space-y-0.5">
              {result.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" /> {a}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button" onClick={applyResult}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-warm-500 text-white text-sm font-semibold rounded-lg hover:bg-warm-600 transition-colors"
          >
            <Check className="w-4 h-4" /> Use {money(Math.round((result.priceMin + result.priceMax) / 2))}
          </button>
        </div>
      )}
    </div>
  );
}
