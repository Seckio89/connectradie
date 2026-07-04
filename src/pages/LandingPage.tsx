import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import ForTradiesSection from '../components/ForTradiesSection';
import HowItWorksSection from '../components/HowItWorksSection';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import OneflareBanner from '../components/OneflareBanner';

/** Returns true when viewport is below the md breakpoint (768px). */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isMobile;
}

/**
 * True when running inside the native Android/iOS Capacitor shell.
 * This is a synchronous, zero-cost check — safe to call at module level.
 */
const isNativePlatform = Capacitor.isNativePlatform();

export default function LandingPage() {
  const { user, profile, loading } = useAuth();
  const isMobile = useIsMobile();

  // On native app OR mobile browser, skip the marketing landing page entirely.
  // Capacitor.isNativePlatform() is the reliable check — viewport width alone
  // can't be trusted inside a WebView (tablets, split-screen, etc.).
  const shouldSkipLanding = isNativePlatform || isMobile;

  // Still resolving auth state — show spinner so we don't flash wrong content
  if (shouldSkipLanding && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  // Logged in on native/mobile → straight to dashboard
  if (shouldSkipLanding && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Logged out on native/mobile → straight to login
  if (shouldSkipLanding && !user) {
    return <Navigate to="/login" replace />;
  }

  // Desktop (all users): full marketing landing page — unchanged
  return (
    <div className="min-h-screen bg-navy-900 font-sans antialiased theme-aware flex flex-col">
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
            "description": "Australia's trusted marketplace connecting homeowners with verified trade professionals.",
            "contactPoint": {
              "@type": "ContactPoint",
              "contactType": "customer service",
              "areaServed": "AU"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "ConnecTradie",
            "url": "https://connectradie.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://connectradie.com/search?trade={search_term_string}"
              },
              "query-input": "required name=search_term_string"
            }
          }
        ]}
      />
      <OneflareBanner />
      <Navbar />
      <main id="main-content" className="flex-1">
        <HeroSection />
        <div id="platform">
          <ForTradiesSection />
          <HowItWorksSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
