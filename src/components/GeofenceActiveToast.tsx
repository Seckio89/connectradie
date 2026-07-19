// ─────────────────────────────────────────────────────────────────────────────
// GeofenceActiveToast — a one-time reassurance banner shown the first time site
// geofencing actually goes live for a job. Listens for GEOFENCE_ACTIVE_EVENT
// (fired once per device by useSiteGeofencing) and auto-dismisses.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { GEOFENCE_ACTIVE_EVENT } from '../lib/siteGeofence';

export default function GeofenceActiveToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onActive = () => setShow(true);
    window.addEventListener(GEOFENCE_ACTIVE_EVENT, onActive);
    return () => window.removeEventListener(GEOFENCE_ACTIVE_EVENT, onActive);
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 10000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm z-[60] animate-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3 rounded-xl bg-white border border-secondary-200 shadow-lg p-4">
        <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-5 h-5 text-secondary-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">📍 Location tracking active for this job</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            You’ll be automatically checked in and out. Your location is not shared with anyone.
          </p>
        </div>
        <button
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="p-1 text-gray-400 hover:text-gray-600 rounded-md flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
