import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import HowItWorksClientsSection from '../components/HowItWorksClientsSection';
import CategoriesSection from '../components/CategoriesSection';
import FeaturesSection from '../components/FeaturesSection';
import ForTradiesSection from '../components/ForTradiesSection';
import HowItWorksSection from '../components/HowItWorksSection';
import Footer from '../components/Footer';
import SEO from '../components/SEO';

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

/** Minimal mobile login/signup screen for logged-out users. */
function MobileLoginScreen() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center px-6">
      <div className="mb-8">
        <span className="text-3xl font-bold text-white">
          Connec<span className="text-primary-400">Tradie</span>
        </span>
      </div>
      <p className="text-navy-300 text-lg text-center mb-12">
        Book licensed tradies. Pay when it's done.
      </p>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <Link
          to="/login"
          className="w-full py-3 px-4 bg-warm-500 text-white text-center font-semibold rounded-xl hover:bg-warm-600 transition-colors"
        >
          Log in
        </Link>
        <Link
          to="/register"
          className="w-full py-3 px-4 bg-white/10 text-white text-center font-semibold rounded-xl hover:bg-white/20 transition-colors"
        >
          Sign up free
        </Link>
      </div>
      <p className="mt-16 text-xs text-navy-500 text-center tracking-wide">
        Payment protected · ABN verified · 5-star avg
      </p>
    </div>
  );
}

export default function LandingPage() {
  const { user, profile, loading } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Logged-in mobile users: redirect straight to dashboard
  useEffect(() => {
    if (!loading && user && isMobile) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, isMobile, navigate]);

  // Mobile + auth loading: show a spinner while we determine what to render
  if (isMobile && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  // Mobile + logged-in: show spinner while redirect fires
  if (isMobile && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  // Mobile + logged-out: show minimal login screen
  if (isMobile && !user) {
    return <MobileLoginScreen />;
  }

  // Desktop (all users): full marketing landing page — unchanged
  return (
    <div className="min-h-screen bg-navy-900 font-sans antialiased theme-aware flex flex-col">
      <SEO
        title="Hire Local Tradies in Australia"
        description="Find and book verified plumbers, electricians, builders and 30+ trade categories across Australia. Real-time availability, instant quotes, zero hassle."
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
      <Navbar />
      <main id="main-content" className="flex-1">
        <HeroSection />
        <HowItWorksClientsSection />
        <CategoriesSection />
        <FeaturesSection />
        <ForTradiesSection />
        <HowItWorksSection />
      </main>
      <Footer />
    </div>
  );
}
