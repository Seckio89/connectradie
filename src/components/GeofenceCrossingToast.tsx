// ─────────────────────────────────────────────────────────────────────────────
// GeofenceCrossingToast — instant in-app feedback when the device crosses a
// job-site boundary while the app is open (foreground plugin event). The
// durable record + notification still come from the geofence-event edge fn.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { GEOFENCE_CROSSING_EVENT } from '../lib/siteGeofence';

export default function GeofenceCrossingToast() {
  const [crossing, setCrossing] = useState<'ENTER' | 'EXIT' | null>(null);

  useEffect(() => {
    const onCrossing = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'ENTER' || action === 'EXIT') setCrossing(action);
    };
    window.addEventListener(GEOFENCE_CROSSING_EVENT, onCrossing);
    return () => window.removeEventListener(GEOFENCE_CROSSING_EVENT, onCrossing);
  }, []);

  useEffect(() => {
    if (!crossing) return;
    const t = setTimeout(() => setCrossing(null), 8000);
    return () => clearTimeout(t);
  }, [crossing]);

  if (!crossing) return null;
  const isIn = crossing === 'ENTER';

  return (
    <div className="fixed inset-x-4 top-20 sm:top-6 sm:left-auto sm:right-6 sm:max-w-sm z-[70] animate-in slide-in-from-top-2">
      <div className={`flex items-start gap-3 rounded-xl border shadow-lg p-4 ${isIn ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isIn ? 'bg-emerald-500' : 'bg-gray-100'}`}>
          {isIn ? <LogIn className="w-5 h-5 text-white" /> : <LogOut className="w-5 h-5 text-gray-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isIn ? 'text-emerald-800' : 'text-gray-900'}`}>
            {isIn ? '✅ Checked in — you’ve arrived on site' : 'Checked out of the site'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {isIn ? 'Your time on site is being recorded.' : 'Your time on site has been saved to the job.'}
          </p>
        </div>
        <button onClick={() => setCrossing(null)} aria-label="Dismiss" className="p-1 text-gray-400 hover:text-gray-600 rounded-md flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
