import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Terms of Service"
        description="ConnecTradie terms of service and user agreement. Read our terms governing the use of Australia's trusted tradie marketplace."
        canonical="/terms"
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
        <h1 className="text-3xl font-bold text-gray-900 mb-1">ConnecTradie Terms of Service & User Agreement</h1>
        <p className="text-sm text-gray-500 mb-1">Version 1.1 | Effective Date: 7 March 2026</p>
        <p className="text-sm text-gray-500 mb-10">Governing Law: New South Wales, Australia</p>

        <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-5 mb-10">
          <p className="text-sm text-gray-700 leading-relaxed">
            Please read these Terms of Service ("Terms") carefully before using the ConnecTradie platform ("Platform"). These Terms constitute a binding legal agreement between you and ConnecTradie Pty Ltd (ACN to be inserted). By creating an account or using the Platform, you confirm that you have read, understood, and agree to be bound by these Terms and our{' '}
            <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium">Privacy Policy</Link>, which is incorporated by reference. If you do not agree, you must not use the Platform.
          </p>
          <p className="text-xs text-gray-500 mt-3">
            <strong>Legal Note:</strong> These Terms are subject to the Australian Consumer Law (ACL) and the Competition and Consumer Act 2010 (Cth). Nothing in these Terms excludes rights that cannot be excluded by law.
          </p>
        </div>

        <div className="prose prose-gray max-w-none space-y-10">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Nature of Our Service & Relationship</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie provides a digital marketplace platform connecting homeowners ("Clients") with independent service providers ("Tradies"). By using this Platform, you acknowledge:
            </p>
            <ul className="mt-3 space-y-2 text-gray-600">
              <li><strong>Facilitation Only:</strong> ConnecTradie is a facilitator and is not a party to any agreement, contract, or job initiated between Clients and Tradies.</li>
              <li><strong>Independence:</strong> No agency, partnership, joint venture, or employer-employee relationship is created between ConnecTradie and any user.</li>
              <li><strong>Contractual Separation:</strong> Any contract for work is strictly a private agreement between the Client and the Tradie. ConnecTradie is not liable under any such agreement.</li>
              <li><strong>No Guarantee of Availability or Suitability:</strong> ConnecTradie does not warrant the availability, quality, suitability, or legality of any Tradie, service, or job posted on the Platform. Clients must perform their own due diligence before engaging any Tradie.</li>
              <li><strong>Platform Modification:</strong> ConnecTradie may modify, suspend, or discontinue any aspect of the Platform at any time, with reasonable notice where practicable.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Tradie Warranties & Verification</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              To maintain a high-standard community, Tradies must provide specific warranties upon registration and on an ongoing basis:
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-2">2.1 Credential Warranty</h3>
            <p className="text-gray-600 leading-relaxed">
              Tradies warrant that, at all times while operating on the Platform, they hold:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>A valid Australian Business Number (ABN);</li>
              <li>Current trade licences and all necessary professional qualifications required by applicable Australian Commonwealth, State, and Territory law; and</li>
              <li>Any other registrations, permits, or certifications required for the specific services offered.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.2 Insurance Requirement</h3>
            <p className="text-gray-600 leading-relaxed">
              Tradies warrant they maintain, at all times while operating on the Platform, active Public Liability Insurance with a minimum coverage of $5,000,000 AUD per occurrence. Tradies must:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Provide proof of current insurance upon request by ConnecTradie; and</li>
              <li>Notify ConnecTradie in writing within seven (7) days if their insurance coverage lapses, is cancelled, reduced below the minimum threshold, or materially changes.</li>
            </ul>
            <div className="mt-3 bg-warm-50 border border-warm-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>Consequences of Non-Compliance:</strong> Failure to maintain required credentials or insurance, or failure to notify ConnecTradie of any material change, will result in immediate account suspension pending re-verification. ConnecTradie reserves the right to permanently terminate accounts where compliance cannot be confirmed.
              </p>
            </div>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">2.3 Verification Limitation</h3>
            <p className="text-gray-600 leading-relaxed">
              Any verification undertaken by ConnecTradie represents a "point-in-time" check of documents submitted by the Tradie. Verification:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Is not an endorsement of quality, capability, or suitability;</li>
              <li>Does not constitute a guarantee of continuous licence or insurance validity; and</li>
              <li>Does not create any duty of care by ConnecTradie to Clients in respect of a verified Tradie's ongoing compliance.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Clients are strongly encouraged to independently verify a Tradie's credentials directly with the relevant licensing authority before engaging their services.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Payments, Fees, Platform Integrity & Escrow</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              To ensure security and protect all users, all connections and payments initiated through ConnecTradie must be managed exclusively through the Platform.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-2">3.1 Escrow Payment Model</h3>
            <p className="text-gray-600 leading-relaxed">ConnecTradie operates an escrow payment model:</p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Upon a Client accepting a quote, the agreed job amount is held in escrow by ConnecTradie via our third-party payment processor.</li>
              <li>Funds are released to the Tradie upon Client confirmation of satisfactory job completion, or automatically following a specified period after job completion if no dispute is raised ("Auto-Release Period").</li>
              <li>The Auto-Release Period and specific conditions for fund release are set out in the Platform's payment documentation, as updated from time to time.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.2 Secure Processing</h3>
            <p className="text-gray-600 leading-relaxed">
              All transactions are processed using encrypted third-party payment processors. ConnecTradie does not store full payment card details. In the event of a third-party processor failure, outage, or other circumstance beyond ConnecTradie's reasonable control, ConnecTradie will not be liable for delays in payment processing (see Section 8 &ndash; Force Majeure).
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.3 Non-Circumvention</h3>
            <p className="text-gray-600 leading-relaxed">
              Users agree not to solicit, accept, or facilitate payments outside the Platform for any job, engagement, or service that originated through the Platform. This includes direct bank transfers, cash payments, or use of third-party payment platforms arranged to avoid Platform fees.
            </p>
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>Consequences:</strong> Bypassing the Platform's payment system will result in permanent account termination and forfeiture of access to all Platform protections, including dispute resolution and escrow. ConnecTradie reserves the right to pursue recovery of lost service fees and any associated costs.
              </p>
            </div>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">3.4 Service Fees & GST</h3>
            <p className="text-gray-600 leading-relaxed">
              Service fees are charged for access to the Platform and its marketplace tools. All fees are:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Displayed inclusive of Goods and Services Tax (GST) at the current rate of 10%, unless otherwise stated;</li>
              <li>Non-refundable except where required by the Australian Consumer Law (ACL) or as otherwise stated in these Terms; and</li>
              <li>Subject to change upon thirty (30) days' written notice via the Platform or registered email address.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Limitation of Liability & Indemnity</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-2">4.1 ACL Safe-Harbour</h3>
            <p className="text-gray-600 leading-relaxed">
              Nothing in these Terms excludes, restricts, or modifies any guarantee, right, or remedy that you have under the Australian Consumer Law or any other applicable law that cannot lawfully be excluded.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">4.2 Exclusion of Liability</h3>
            <p className="text-gray-600 leading-relaxed">
              To the maximum extent permitted by law, ConnecTradie is not liable for:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>"No-shows," cancellations, delays, or poor workmanship by Tradies;</li>
              <li>Personal injury, property damage, or financial loss caused by a Tradie;</li>
              <li>Any indirect, consequential, incidental, special, or economic loss, including loss of income, loss of profits, or loss of business, arising from your use of the Platform or any job undertaken through it; or</li>
              <li>Loss or damage arising from reliance on Platform content, Tradie profiles, reviews, or verification status.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">4.3 Aggregate Liability Cap</h3>
            <p className="text-gray-600 leading-relaxed">
              Subject to clause 4.1, ConnecTradie's total aggregate liability to you for all claims arising out of or in connection with these Terms or the Platform is strictly limited to the total service fees you paid to ConnecTradie in the six (6) months immediately preceding the event giving rise to the claim.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">4.4 Indemnity</h3>
            <p className="text-gray-600 leading-relaxed">
              You agree to indemnify, defend, and hold harmless ConnecTradie, its officers, directors, employees, and agents from and against any claims, losses, damages, costs, and legal expenses arising from:
            </p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Your breach of these Terms;</li>
              <li>Your conduct on the Platform, including any job undertaken or contracted through it;</li>
              <li>Your infringement of any third-party rights; or</li>
              <li>Any false, misleading, or incomplete information you provide to the Platform.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              This indemnity does not apply to the extent that a claim arises from ConnecTradie's own gross negligence or fraudulent conduct.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. User Conduct & Account Termination</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-2">5.1 Prohibited Conduct</h3>
            <p className="text-gray-600 leading-relaxed">Users must not:</p>
            <ul className="mt-2 space-y-2 text-gray-600">
              <li>Provide false, misleading, or fraudulent information or credentials;</li>
              <li>Engage in harassment, abuse, or unprofessional conduct toward other users;</li>
              <li>Attempt to circumvent Platform security, payment systems, or verification processes;</li>
              <li>Post false or misleading reviews; or</li>
              <li>Take any action that undermines the security, integrity, or trust of the ConnecTradie community.</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">5.2 Suspension & Termination</h3>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie reserves the right to suspend or terminate any account, with or without prior notice, where there are reasonable grounds to believe a user has breached these Terms or applicable law. Where practicable, ConnecTradie will provide notice and an opportunity to respond prior to permanent termination, except in cases involving fraud, safety risks, or serious misconduct.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">5.3 Right of Appeal</h3>
            <p className="text-gray-600 leading-relaxed">
              If your account is suspended or terminated and you believe this was made in error, you may submit a written appeal to{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>{' '}
              within fourteen (14) days of notification. ConnecTradie will review appeals in good faith and respond within ten (10) business days. ConnecTradie's decision following appeal is final.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Intellectual Property & User Content</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-2">6.1 Ownership</h3>
            <p className="text-gray-600 leading-relaxed">
              The ConnecTradie name, logo, website design, software, and all associated intellectual property are the exclusive property of ConnecTradie Pty Ltd. Nothing in these Terms grants you any right to use ConnecTradie's intellectual property without prior written consent.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">6.2 User Content Licence</h3>
            <p className="text-gray-600 leading-relaxed">
              By uploading photos, reviews, or other content to the Platform ("User Content"), you grant ConnecTradie a perpetual, worldwide, royalty-free, non-exclusive, sublicensable licence to use, reproduce, modify, and display such User Content for the purposes of operating and marketing the Platform.
            </p>
            <p className="text-gray-600 leading-relaxed mt-2">
              ConnecTradie will not use User Content in any manner that personally identifies you without your prior consent, except as required by law. This licence survives account termination.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">6.3 Your Warranties Regarding Content</h3>
            <p className="text-gray-600 leading-relaxed">
              You warrant that any User Content you upload does not infringe any third-party intellectual property rights and that you have all necessary permissions to grant the licence in clause 6.2.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie collects, uses, and discloses personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs). This includes collection of ABNs, licence numbers, identity documents, and financial data necessary to operate the Platform.
            </p>
            <p className="text-gray-600 leading-relaxed mt-2">
              Our full{' '}
              <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium">Privacy Policy</Link>, which forms part of these Terms, is available on our website. By using the Platform, you consent to the collection and use of your personal information as set out in the Privacy Policy.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Force Majeure</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie is not liable for any failure or delay in performing its obligations under these Terms arising from circumstances beyond its reasonable control, including but not limited to: natural disasters, acts of government, pandemic, cyberattacks, third-party platform outages (including payment processors), or telecommunications failures. ConnecTradie will take reasonable steps to resume normal operation as soon as practicable.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Amendments to These Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie may amend these Terms from time to time. Where changes are material, ConnecTradie will provide at least thirty (30) days' written notice via the Platform or your registered email address. Your continued use of the Platform after the effective date of any amendment constitutes acceptance of the updated Terms. If you do not accept the amended Terms, you must cease using the Platform and notify us at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Dispute Resolution Process</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Before seeking external legal action, all users must follow this tiered resolution process in good faith:
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-2">Step 1 &ndash; Direct Negotiation</h3>
            <p className="text-gray-600 leading-relaxed">
              The parties must first attempt to resolve the dispute directly between themselves within fourteen (14) days of the dispute arising.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">Step 2 &ndash; Internal Mediation</h3>
            <p className="text-gray-600 leading-relaxed">
              If direct negotiation fails, the complainant must notify ConnecTradie in writing at{' '}
              <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>.
              ConnecTradie will facilitate good-faith negotiation between the parties for a period of thirty (30) days from receipt of written notice ("Mediation Period").
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">Step 3 &ndash; External Resolution</h3>
            <p className="text-gray-600 leading-relaxed">
              If the dispute remains unresolved after the Mediation Period, the parties may, by mutual agreement, refer the matter to an accredited mediator or arbitrator. If no agreement is reached within fourteen (14) days of the Mediation Period ending, either party may proceed to litigation in accordance with clause 10.4 below.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-5 mb-2">10.4 &ndash; Governing Law & Jurisdiction</h3>
            <p className="text-gray-600 leading-relaxed">
              These Terms are governed exclusively by the laws of New South Wales, Australia. The parties irrevocably submit to the exclusive jurisdiction of the courts of New South Wales for the resolution of any dispute arising out of or in connection with these Terms or the Platform.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. General Provisions</h2>
            <ul className="space-y-3 text-gray-600">
              <li><strong>Severability:</strong> If any provision of these Terms is found to be invalid or unenforceable, it will be severed to the minimum extent necessary, and the remaining provisions will continue in full force.</li>
              <li><strong>Entire Agreement:</strong> These Terms, together with the Privacy Policy and any supplementary Platform policies, constitute the entire agreement between you and ConnecTradie regarding your use of the Platform.</li>
              <li><strong>Waiver:</strong> A failure by ConnecTradie to enforce any right under these Terms does not constitute a waiver of that right.</li>
              <li><strong>No Assignment:</strong> You may not assign your rights or obligations under these Terms without ConnecTradie's prior written consent.</li>
            </ul>
          </section>

          {/* Contact */}
          <section className="border-t border-gray-200 pt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Questions & Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              For any questions regarding these Terms, please contact:
            </p>
            <div className="mt-3 bg-gray-50 rounded-xl p-5">
              <p className="font-semibold text-gray-900">ConnecTradie Pty Ltd</p>
              <p className="text-gray-600 mt-1">
                <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700">admin@connectradie.com</a>
              </p>
              <p className="text-gray-600 mt-1">ABN: 75 655 516 546</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
