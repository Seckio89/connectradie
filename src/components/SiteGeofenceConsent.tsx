// ─────────────────────────────────────────────────────────────────────────────
// SiteGeofenceConsent — decides when to show the background-location disclosure.
// Renders nothing on web / for non-tradies. On the native app it shows the
// disclosure ONCE, in context (the tradie actually has a booked site visit), and
// only after acceptance does it flip consent so useSiteGeofencing may request the
// OS "Always" permission and start geofencing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  isNativeApp,
  shouldPromptGeofenceDisclosure,
  grantGeofenceConsent,
  dismissGeofenceDisclosure,
} from '../lib/siteGeofence';
import SiteLocationDisclosureModal from './SiteLocationDisclosureModal';

interface SiteGeofenceConsentProps {
  /** Called after the user accepts, so the parent can enable geofencing. */
  onGranted: () => void;
}

export default function SiteGeofenceConsent({ onGranted }: SiteGeofenceConsentProps) {
  const { user, profile } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!user || profile?.role !== 'tradie') return;
    if (!shouldPromptGeofenceDisclosure()) return;

    let cancelled = false;
    (async () => {
      // Only prompt in context — when there's actually a booked visit to geofence.
      const { count } = await supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('tradie_id', user.id)
        .eq('status', 'site_visit_scheduled');
      if (!cancelled && (count ?? 0) > 0) setShow(true);
    })();

    return () => { cancelled = true; };
  }, [user, profile?.role]);

  const handleAllow = () => {
    grantGeofenceConsent();
    setShow(false);
    onGranted();
  };

  const handleDismiss = () => {
    dismissGeofenceDisclosure();
    setShow(false);
  };

  return <SiteLocationDisclosureModal isOpen={show} onAllow={handleAllow} onDismiss={handleDismiss} />;
}
