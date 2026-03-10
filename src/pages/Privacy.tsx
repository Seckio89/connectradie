import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Privacy Policy"
        description="ConnecTradie privacy policy. Learn how we collect, use and protect your personal information in compliance with Australian Privacy Principles."
        canonical="/privacy"
      />
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
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

      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">ConnecTradie Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-1">Version 1.1 | Last Updated: March 2026</p>
        <p className="text-sm text-gray-500 mb-10">ConnecTradie Pty Ltd | ABN: 75 655 516 546</p>

        <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-5 mb-10">
          <p className="text-sm text-gray-700 leading-relaxed">
            This Privacy Policy ("Policy") describes how ConnecTradie Pty Ltd (ABN 75 655 516 546) ("ConnecTradie", "we", "our", "us") collects, uses, discloses, and manages your personal information. It forms part of our{' '}
            <Link to="/terms" className="text-primary-600 hover:text-primary-700 font-medium">Terms of Service</Link>, which are incorporated by reference.
          </p>
          <p className="text-sm text-gray-700 leading-relaxed mt-3">
            By creating an account or using the Platform, you confirm that you have read and understood this Policy and consent to the collection and use of your personal information as described herein. If you do not agree, you must not use the Platform.
          </p>
          <p className="text-xs text-gray-500 mt-3">
            <strong>Legal Note:</strong> This Policy operates in accordance with the Privacy Act 1988 (Cth), the Australian Privacy Principles (APPs), and where applicable, the Notifiable Data Breaches (NDB) scheme under Part IIIC of the Privacy Act.
          </p>
        </div>

        <div className="prose prose-gray max-w-none space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Our Commitment to Your Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie is committed to handling personal information responsibly, transparently, and in accordance with Australian law. We collect only what is reasonably necessary to operate our marketplace, we do not sell personal information, and we take active steps to protect the data entrusted to us by our community.
            </p>
            <p className="text-gray-600 leading-relaxed mt-2">
              This Policy applies to all users of the ConnecTradie platform, including Clients (homeowners), Tradies (independent service providers), and visitors to our website.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect & Why</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We collect personal information that is reasonably necessary for our marketplace functions. The categories of information we collect, and our lawful basis for doing so, are set out below.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-2">2.1 Identity & Contact Information</h3>
            <p className="text-gray-600 leading-relaxed">Collected from all users upon registration:</p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li><strong>Full name:</strong> to create and identify your account.</li>
              <li><strong>Email address:</strong> to communicate with you and send platform notifications.</li>
              <li><strong>Phone number:</strong> to facilitate communication between Clients and Tradies once a job is initiated.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.2 Professional Credentials (Tradies Only)</h3>
            <p className="text-gray-600 leading-relaxed">Collected to verify eligibility to provide services on the Platform:</p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li><strong>Australian Business Number (ABN):</strong> verified against the Australian Business Register.</li>
              <li><strong>Trade licences and qualifications:</strong> to confirm compliance with applicable Commonwealth, State, and Territory law.</li>
              <li><strong>Public Liability Insurance details:</strong> to confirm minimum coverage requirements are met (see{' '}
                <Link to="/terms" className="text-primary-600 hover:text-primary-700">Terms of Service, Section 2.2</Link>).
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-2 text-sm">
              These documents are collected under our Tradie Warranty obligations and are subject to point-in-time verification only. See{' '}
              <Link to="/terms" className="text-primary-600 hover:text-primary-700">Terms of Service Section 2.3</Link> for verification limitations.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.3 Verification & Trust Data</h3>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li><strong>Profile photos:</strong> to build a transparent and trustworthy community.</li>
              <li><strong>User reviews and ratings:</strong> to inform other users' decision-making.</li>
              <li><strong>Identity verification documents:</strong> where required for enhanced verification tiers.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.4 Financial Data</h3>
            <p className="text-gray-600 leading-relaxed">
              All payment details are processed via encrypted third-party payment gateways (currently Stripe). ConnecTradie does not store full payment card numbers or bank account details on its own systems. We retain transaction records (amount, date, job reference) for accounting, tax, and dispute resolution purposes in accordance with our legal obligations under the Corporations Act 2001 (Cth) and taxation law.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.5 Technical & Usage Data</h3>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li><strong>IP addresses and device identifiers:</strong> to prevent fraud and maintain platform security.</li>
              <li><strong>Browser type and operating system:</strong> for platform optimisation and security monitoring.</li>
              <li><strong>Usage data and session logs:</strong> to improve platform performance and user experience.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How Your Information Is Shared</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We do not sell, rent, or trade your personal information to third parties for marketing purposes. Sharing is strictly limited to what is required to operate the Platform:
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-2">3.1 Marketplace Connections</h3>
            <p className="text-gray-600 leading-relaxed">
              We share necessary contact details (name, phone number, and job details) between a Client and a Tradie only once a connection or booking is formally initiated through the Platform. This sharing is necessary to perform the contract between you and the other party.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.2 Service Providers & Sub-processors</h3>
            <p className="text-gray-600 leading-relaxed">
              We share data with trusted third-party service providers who assist us in operating the Platform. All sub-processors are:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Contractually bound to protect your personal information in accordance with the APPs;</li>
              <li>Prohibited from using your data for any purpose other than providing services to ConnecTradie; and</li>
              <li>Required to maintain appropriate security standards.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-2">
              Current key sub-processors include: Stripe (payment processing), ABN Lookup (ABN verification), and cloud infrastructure providers. An up-to-date list of sub-processors is available on request at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.3 Legal & Regulatory Disclosure</h3>
            <p className="text-gray-600 leading-relaxed">
              We may disclose personal information to government bodies, law enforcement, or regulatory authorities (including the ATO, ASIC, or state licensing bodies) where required or authorised by Australian law, including in response to a valid court order, subpoena, or regulatory requirement.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.4 Overseas Disclosure</h3>
            <p className="text-gray-600 leading-relaxed">
              Some of our sub-processors may store or process data outside Australia (for example, cloud infrastructure in the United States or Ireland). Where this occurs, we take reasonable steps to ensure those recipients handle your information consistently with the APPs, including through contractual data processing agreements. By using the Platform, you consent to this potential overseas disclosure.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Security: Protecting Your Data</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              ConnecTradie implements industry-standard, layered security measures to protect your personal information:
            </p>
            <ul className="space-y-2 text-gray-600">
              <li><strong>Encryption:</strong> all data is encrypted in transit (TLS 1.2+) and at rest using AES-256 or equivalent standards.</li>
              <li><strong>Access Controls:</strong> strict internal protocols ensure only authorised personnel can access sensitive information, on a need-to-know basis.</li>
              <li><strong>Authentication:</strong> multi-factor authentication is available and encouraged for all accounts.</li>
              <li><strong>Audits & Monitoring:</strong> we conduct regular security audits and monitor for suspicious activity.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              While we take all reasonable steps to protect your information, no internet-based system is completely secure. We encourage users to use strong, unique passwords and to notify us immediately at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>{' '}
              if they suspect unauthorised access to their account.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">4.1 Notifiable Data Breaches</h3>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie complies with the Notifiable Data Breaches (NDB) scheme. In the event of an eligible data breach that is likely to result in serious harm to affected individuals, we will notify the Office of the Australian Information Commissioner (OAIC) and affected users as soon as practicable, in accordance with our obligations under Part IIIC of the Privacy Act 1988 (Cth).
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Your Rights Under Australian Law</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Under the Privacy Act 1988 (Cth) and the Australian Privacy Principles, you have the following rights in relation to your personal information:
            </p>
            <ul className="space-y-3 text-gray-600">
              <li><strong>Access:</strong> you may request access to the personal information we hold about you. We will respond within 30 days. We may charge a reasonable fee to cover the cost of providing access.</li>
              <li><strong>Correction:</strong> if you believe information we hold is inaccurate, out of date, or incomplete, you may request correction at any time through your account dashboard or by contacting us at{' '}
                <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>.
              </li>
              <li><strong>Deletion:</strong> you may request deletion of your account and associated personal data. We will action deletion requests subject to our legal obligations to retain certain records (including financial, tax, and dispute records) as required by the Corporations Act 2001 (Cth), the Income Tax Assessment Act 1997 (Cth), or other applicable law.</li>
              <li><strong>Complaint:</strong> if you believe your privacy has been mishandled, you have the right to lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at www.oaic.gov.au or by calling 1300 363 992. We encourage you to contact us first so we can attempt to resolve your concern directly.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              To exercise any of the above rights, please contact our Privacy Officer at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>. We will respond within 30 days of receiving your request.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Retention of Personal Information</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We retain personal information only for as long as is necessary for the purposes for which it was collected, or as required by law. Our general retention periods are:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Data Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3">Account data</td>
                    <td className="px-4 py-3">Duration of account + 7 years (ATO requirements)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3">Transaction & financial records</td>
                    <td className="px-4 py-3">7 years (taxation & corporate law)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3">Verification documents (Tradies)</td>
                    <td className="px-4 py-3">Duration of listing + 2 years</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Support & dispute records</td>
                    <td className="px-4 py-3">3 years following resolution</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-600 leading-relaxed mt-3">
              Where personal information is no longer required, we will take reasonable steps to destroy or de-identify it securely.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies & Tracking Technologies</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We use cookies and similar tracking technologies on the Platform. These fall into two categories:
            </p>
            <ul className="space-y-3 text-gray-600">
              <li><strong>Essential Cookies:</strong> required for core Platform functionality, including keeping you logged in and maintaining session security. These cannot be disabled without affecting Platform operation.</li>
              <li><strong>Analytics Cookies:</strong> used to understand how users interact with the Platform and to improve user experience. These are non-essential and can be managed via your browser settings or our cookie preference centre.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              By continuing to use the Platform, you consent to our use of essential cookies. You may withdraw consent to analytics cookies at any time via your browser settings, though some Platform features may be limited as a result.
            </p>
            <p className="text-gray-600 leading-relaxed mt-2">
              We do not use cookies to serve third-party advertising. ConnecTradie products are ad-free.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Amendments to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie may update this Policy from time to time to reflect changes in our practices, technology, or legal obligations. Where changes are material, we will provide at least thirty (30) days' written notice via the Platform or your registered email address, consistent with our{' '}
              <Link to="/terms" className="text-primary-600 hover:text-primary-700">Terms of Service Section 9</Link>.
            </p>
            <p className="text-gray-600 leading-relaxed mt-2">
              Your continued use of the Platform after the effective date of any amendment constitutes acceptance of the updated Policy. If you do not accept the amended Policy, you must cease using the Platform and notify us at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>.
            </p>
          </section>

          {/* Section 9 - Contact */}
          <section className="border-t border-gray-200 pt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contact Our Privacy Officer</h2>
            <p className="text-gray-600 leading-relaxed">
              For any questions, access requests, correction requests, or privacy complaints, please contact:
            </p>
            <div className="mt-3 bg-gray-50 rounded-xl p-5">
              <p className="font-semibold text-gray-900">ConnecTradie Privacy Officer</p>
              <p className="text-gray-600 mt-1">
                Email:{' '}
                <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>
              </p>
              <p className="text-gray-600 mt-1">Address: ConnecTradie Pty Ltd, Sydney NSW, Australia</p>
              <p className="text-gray-600 mt-1">ABN: 75 655 516 546</p>
            </div>
            <p className="text-gray-600 leading-relaxed mt-4">
              For complaints not resolved by ConnecTradie, you may contact the OAIC at{' '}
              <span className="text-gray-700 font-medium">www.oaic.gov.au</span> or by calling{' '}
              <span className="text-gray-700 font-medium">1300 363 992</span>.
            </p>
          </section>

          {/* Relationship to Terms */}
          <section className="bg-secondary-50 border border-secondary-200 rounded-xl p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Relationship to Terms of Service</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              This Privacy Policy forms part of and must be read together with the ConnecTradie{' '}
              <Link to="/terms" className="text-primary-600 hover:text-primary-700 font-medium">Terms of Service & User Agreement</Link>{' '}
              (Version 1.1). In the event of any inconsistency between this Policy and the Terms of Service on a privacy matter, this Policy prevails.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
