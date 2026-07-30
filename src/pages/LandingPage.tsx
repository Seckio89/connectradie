import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import LandingV2 from '../components/landing/LandingV2';
import SEO from '../components/SEO';

/**
 * True when running inside the native Android/iOS Capacitor shell.
 * This is a synchronous, zero-cost check — safe to call at module level.
 */
const isNativePlatform = Capacitor.isNativePlatform();

/**
 * True when the page was LAUNCHED AS AN APP rather than opened in a browser
 * tab — the Capacitor shell, or an installed PWA running standalone. Those
 * users have already chosen the product and want the dashboard, not a pitch.
 *
 * Viewport width is deliberately NOT part of this. It used to be
 * (`innerWidth < 768`), which meant every homeowner who arrived on a phone
 * browser was redirected to the sign-in form and never saw the marketing site
 * at all — including people landing from the /find and /costs search pages,
 * which exist to acquire exactly those homeowners.
 *
 * `start_url` in manifest.webmanifest is "/", so an installed PWA opens here;
 * without the standalone check it would launch into the marketing page.
 */
const APP_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

function detectAppLaunch() {
  if (isNativePlatform) return true;
  if (typeof window === 'undefined') return false;
  if (APP_DISPLAY_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) return true;
  // iOS home-screen apps predate display-mode and still report this instead.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function useIsAppLaunch() {
  const [isAppLaunch, setIsAppLaunch] = useState(detectAppLaunch);

  useEffect(() => {
    const mql = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setIsAppLaunch(detectAppLaunch());
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isAppLaunch;
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const shouldSkipLanding = useIsAppLaunch();

  // Still resolving auth state — show spinner so we don't flash wrong content.
  // Only ever reached in app-launch mode; a browser tab renders the marketing
  // page immediately and never waits on auth.
  if (shouldSkipLanding && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ct-ink">
        <Loader2 className="w-8 h-8 text-ct-teal animate-spin" />
      </div>
    );
  }

  // Launched as an app, signed in → straight to dashboard
  if (shouldSkipLanding && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Launched as an app, signed out → straight to login
  if (shouldSkipLanding && !user) {
    return <Navigate to="/login" replace />;
  }

  // Desktop (all users): the v2 marketing landing page, rebuilt from the
  // approved reference (Phase 4). Deliberately NOT wrapped in .theme-aware —
  // the page is dark by design and must not be light-remapped; its one light
  // band (the comparison section) is its own deliberate inversion.
  return (
    <div className="min-h-screen bg-ct-ink font-sans antialiased flex flex-col">
      <SEO
        title="Run Your Trade Business & Get Paid Safely"
        description="ConnecTradie is the all-in-one app for Australian tradies — jobs, site calendar, team scheduling, GST invoicing and Stripe-secured payments. No per-lead fees. Free to start."
        canonical="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "ConnecTradie",
            "url": "https://connectradie.com",
            "logo": "https://connectradie.com/icons/icon-192x192.svg",
            "description": "All-in-one business app for Australian tradies — jobs, site calendar, team scheduling, GST invoicing and Stripe-secured escrow payments.",
            "contactPoint": {
              "@type": "ContactPoint",
              "contactType": "customer service",
              "areaServed": "AU"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "ConnecTradie",
            "url": "https://connectradie.com",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web, iOS, Android",
            "description": "Run your whole trade business in one app — job scheduling, team assignment, GST invoicing and Stripe-secured payments. No per-lead fees.",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "AUD"
            }
          }
        ]}
      />
      <main id="main-content" className="flex-1">
        <LandingV2 />
      </main>
    </div>
  );
}
