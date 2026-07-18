// ─────────────────────────────────────────────────────────────────────────────
// PropertyPreview — auto-loads the client's property photo (Google Street View)
// from their stored address/coordinates, so the tradie can eyeball the building
// while pricing. Optionally prefills a floor-area (m²) figure into the estimator.
//
// The Google API key stays server-side: this calls the `property-lookup` edge
// function, which fetches the image and returns it as a base64 data URI.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { MapPin, Home, Loader2, ImageOff, Ruler } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PropertyLookupResult {
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  photoDataUri: string | null;
  /** Nullable — no free source gives exact internal floor area (see edge fn). */
  floorAreaEstimateM2: number | null;
}

interface PropertyPreviewProps {
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Called when the tradie taps "Use ~X m²" — prefills the estimator's area field. */
  onUseArea?: (squareMetres: number) => void;
}

export default function PropertyPreview({ address, lat, lng, onUseArea }: PropertyPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<PropertyLookupResult | null>(null);

  const canLookup = (lat != null && lng != null) || !!address;

  const lookup = async () => {
    if (!canLookup) return;
    setLoading(true);
    setError('');
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke<PropertyLookupResult>(
        'property-lookup',
        { body: { lat, lng, address } },
      );
      if (fnErr || !res) throw fnErr ?? new Error('No result');
      setData(res);
      setLoaded(true);
    } catch {
      setError('Couldn’t load the property photo.');
    }
    setLoading(false);
  };

  if (!canLookup) return null;

  // Collapsed state — one tap to fetch (keeps the estimator light until wanted).
  if (!loaded && !loading) {
    return (
      <button
        type="button"
        onClick={lookup}
        className="w-full flex items-center gap-2 rounded-lg border border-secondary-200 bg-secondary-50/40 px-3 py-2 text-left text-sm text-secondary-700 hover:bg-secondary-50 transition-colors"
      >
        <Home className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">See the property</span>
        <span className="text-[11px] text-gray-500 truncate">{address ?? 'from map location'}</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-secondary-200 bg-white overflow-hidden">
      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : data?.photoDataUri ? (
        <img src={data.photoDataUri} alt="Street view of the property" className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 w-full flex-col items-center justify-center gap-1 bg-gray-50 text-gray-400">
          <ImageOff className="w-5 h-5" />
          <span className="text-xs">No Street View for this address</span>
        </div>
      )}

      <div className="p-3 space-y-2">
        <p className="flex items-start gap-1.5 text-sm font-medium text-gray-900">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary-600" />
          {data?.formattedAddress ?? address}
        </p>

        {data?.floorAreaEstimateM2 ? (
          <button
            type="button"
            onClick={() => onUseArea?.(data.floorAreaEstimateM2 as number)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-warm-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-warm-600 transition-colors"
          >
            <Ruler className="w-3.5 h-3.5" />
            Use ≈ {data.floorAreaEstimateM2} m²
          </button>
        ) : (
          <p className="text-[11px] text-gray-400">
            Floor area isn’t available for this address — enter it from the plan or a quick measure-up.
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
