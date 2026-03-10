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
            "url": "https://connectradie.com.au",
            "logo": "https://connectradie.com.au/icons/icon-192x192.svg",
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
            "url": "https://connectradie.com.au",
            "potentialAction": {
              "@type": "SearchAction",
              "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://connectradie.com.au/search?trade={search_term_string}"
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
