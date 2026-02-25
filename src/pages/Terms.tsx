import { Link } from 'react-router-dom';
import { Wrench, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Terms of Service"
        description="ConnecTradie terms of service. Read our terms governing the use of Australia's trusted tradie marketplace."
        canonical="/terms"
      />
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">
                Connec<span className="text-blue-600">Tradie</span>
              </span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: February 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing or using ConnecTradie ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Platform. ConnecTradie is operated in Australia and these terms are governed by the laws of New South Wales, Australia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie is an online marketplace that connects homeowners and businesses ("Clients") with licensed trade professionals ("Tradies"). We facilitate introductions and bookings but are not a party to any agreement between Clients and Tradies. We do not employ, endorse, or guarantee the work of any Tradie listed on the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. User Accounts</h2>
            <p className="text-gray-600 leading-relaxed">
              You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must be at least 18 years of age to create an account. Tradies must hold valid Australian licenses and insurance relevant to their trade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Payments and Fees</h2>
            <p className="text-gray-600 leading-relaxed">
              Tradies may be required to pay a subscription fee to access premium features. All fees are quoted in Australian Dollars (AUD) and are inclusive of GST where applicable. Payment terms, refund policies, and subscription details are outlined during the checkout process. Clients pay Tradies directly for work performed. ConnecTradie does not take a commission on jobs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. User Conduct</h2>
            <p className="text-gray-600 leading-relaxed">
              You agree not to misuse the Platform, including but not limited to: providing false information, harassing other users, posting inappropriate content, attempting to circumvent the Platform's security, or using the Platform for any unlawful purpose. We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              To the maximum extent permitted by Australian Consumer Law, ConnecTradie is not liable for any indirect, incidental, or consequential damages arising from your use of the Platform. Our total liability to you for any claim arising from these Terms shall not exceed the amount you have paid to ConnecTradie in the 12 months preceding the claim. Nothing in these Terms excludes or limits liability that cannot be excluded under Australian law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these Terms from time to time. We will notify you of material changes by posting the revised Terms on the Platform and updating the "Last updated" date. Your continued use of the Platform after such changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have questions about these Terms, please contact us at{' '}
              <a href="mailto:support@connecttradie.com.au" className="text-primary-600 hover:text-primary-700">
                support@connecttradie.com.au
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
