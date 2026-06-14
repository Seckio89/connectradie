import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import HowItWorksClientsSection from '../components/HowItWorksClientsSection';
import CategoriesSection from '../components/CategoriesSection';
import FeaturesSection from '../components/FeaturesSection';
import ForTradiesSection from '../components/ForTradiesSection';
import HowItWorksSection from '../components/HowItWorksSection';
import Footer from '../components/Footer';
import SEO from '../components/SEO';

export default function LandingPage() {
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
      {/* Mobile-only CTA banner */}
      <div className="md:hidden bg-[#1D9E75]/10 border-t border-[#1D9E75]/20 px-4 py-3">
        <Link to="/register" className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Start free — no card required</p>
            <p className="text-xs text-gray-400">Post a job or sign up as a tradie</p>
          </div>
          <ArrowRight className="w-5 h-5 text-[#1D9E75]" />
        </Link>
      </div>
      <Footer />
    </div>
  );
}
