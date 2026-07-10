// ─────────────────────────────────────────────────────────────────────────────
// SiteCheckInSetting — Settings control for the background-location "automatic
// job-site check-in" feature. Delivers on the disclosure's "you can turn this
// off any time in Settings" promise.
//
// Turning it ON re-shows the full prominent disclosure (affirmative consent is
// required before the OS permission is requested). Turning it OFF revokes consent
// and clears any active geofences. Rendered only on the native app (gated by the
// Settings page) — background location does nothing on web.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  hasGeofenceConsent,
  grantGeofenceConsent,
  revokeGeofenceConsent,
  clearSiteGeofences,
  GEOFENCE_CONSENT_EVENT,
} from '../../lib/siteGeofence';
import SiteLocationDisclosureModal from '../SiteLocationDisclosureModal';

export default function SiteCheckInSetting() {
  const [enabled, setEnabled] = useState(hasGeofenceConsent());
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    const resync = () => setEnabled(hasGeofenceConsent());
    window.addEventListener(GEOFENCE_CONSENT_EVENT, resync);
    return () => window.removeEventListener(GEOFENCE_CONSENT_EVENT, resync);
  }, []);

  const handleToggle = () => {
    if (enabled) {
      revokeGeofenceConsent();
      void clearSiteGeofences();
    } else {
      // Never enable without re-showing the disclosure first (Play compliance).
      setShowDisclosure(true);
    }
  };

  const handleAllow = () => {
    grantGeofenceConsent();
    setShowDisclosure(false);
  };

  return (
    <div className="border-t border-gray-200 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-secondary-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Automatic job-site check-in</p>
            <p className="text-sm text-gray-600 mt-0.5 max-w-md">
              Detects when you arrive at and leave a booked job site — your client is notified you’re on
              site and your on-site hours are logged automatically. Uses background location, even when
              the app is closed or not in use.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          aria-label={enabled ? 'Turn off automatic job-site check-in' : 'Turn on automatic job-site check-in'}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 flex-shrink-0 cursor-pointer ${enabled ? 'bg-warm-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <SiteLocationDisclosureModal
        isOpen={showDisclosure}
        onAllow={handleAllow}
        onDismiss={() => setShowDisclosure(false)}
      />
    </div>
  );
}
