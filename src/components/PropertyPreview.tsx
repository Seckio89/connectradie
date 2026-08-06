// ─────────────────────────────────────────────────────────────────────────────
// PropertyPreview — shows the client's property photo (Google Street View) from
// their stored address/coordinates, so the tradie can eyeball the building while
// pricing.
//
// Loads the Street View Static image directly in the browser using the app's
// existing VITE_GOOGLE_MAPS_API_KEY (the same key used for maps + address
// autocomplete). `return_error_code=true` makes Google return a 404 when there's
// no imagery for the spot, so <img onError> can fall back cleanly.
//
// Requires "Street View Static API" to be enabled on that key in Google Cloud.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { MapPin, Home, ImageOff } from 'lucide-react';

interface PropertyPreviewProps {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export default function PropertyPreview({ address, lat, lng }: PropertyPreviewProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // Prefer exact coordinates; fall back to the text address.
  const location = lat != null && lng != null ? `${lat},${lng}` : (address ?? '');
  if (!MAPS_KEY || !location) return null;

  const photoUrl =
    'https://maps.googleapis.com/maps/api/streetview?size=640x360&location=' +
    encodeURIComponent(location) +
    '&fov=80&pitch=5&return_error_code=true&key=' +
    MAPS_KEY;

  // Collapsed until the tradie asks for it — keeps the estimator light.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-ct-sm border border-ct-line bg-ct-surface-2/40 px-3 py-2 text-left text-sm text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
      >
        <Home className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">See the property</span>
        {address && <span className="text-[0.6875rem] text-ct-mute truncate">{address}</span>}
      </button>
    );
  }

  return (
    <div className="rounded-ct-md border border-ct-line bg-ct-surface overflow-hidden">
      {failed ? (
        <div className="flex h-40 w-full flex-col items-center justify-center gap-1 bg-ct-surface-2 text-ct-mute">
          <ImageOff className="w-5 h-5" />
          <span className="text-xs">No Street View for this address</span>
        </div>
      ) : (
        <img
          src={photoUrl}
          alt="Street view of the property"
          onError={() => setFailed(true)}
          className="h-40 w-full object-cover"
        />
      )}
      {address && (
        <p className="flex items-start gap-1.5 p-3 text-sm font-medium text-ct-paper">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-ct-mute-2" />
          {address}
        </p>
      )}
    </div>
  );
}
