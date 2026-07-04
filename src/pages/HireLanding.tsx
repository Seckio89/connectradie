import Navbar from '../components/Navbar';
import HireHeroSection from '../components/HireHeroSection';
import HowItWorksClientsSection from '../components/HowItWorksClientsSection';
import CategoriesSection from '../components/CategoriesSection';
import FeaturesSection from '../components/FeaturesSection';
import Footer from '../components/Footer';
import SEO from '../components/SEO';

/**
 * Homeowner-facing marketing page (/hire). Trust/escrow hero + the "how it
 * works for clients", categories and features sections that used to sit on the
 * main landing page. The main page (/) is now tradie-first.
 */
export default function HireLanding() {
  return (
    <div className="min-h-screen bg-navy-900 font-sans antialiased theme-aware flex flex-col">
      <SEO
        title="Hire a Licensed Tradie — Payment Protected"
        description="Post your job free and hire verified, licensed Australian tradies. Your payment is held safely by Stripe and only released when you approve the finished work."
        canonical="/hire"
      />
      <Navbar />
      <main id="main-content" className="flex-1">
        <HireHeroSection />
        <div id="protected">
          <HowItWorksClientsSection />
          <FeaturesSection />
          <CategoriesSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
