import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Scale, FileText as FileTextIcon } from 'lucide-react';
import SEO from '../components/SEO';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Terms of Service"
        description="ConnecTradie terms of service and user agreement. Read our terms governing the use of Australia's trusted tradie marketplace."
        canonical="/terms"
        lastUpdated="7 March 2026"
      />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
              </span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>
        </div>
      </header>

      {/* Hero / Title Area */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex w-12 h-12 bg-primary-100 rounded-xl items-center justify-center flex-shrink-0">
              <Scale className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Terms of Service & User Agreement</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  <FileTextIcon className="w-3 h-3" />
                  Version 1.3
                </span>
                <span className="text-xs text-gray-400">Effective: 7 March 2026</span>
                <span className="text-xs text-gray-400">ABN: 75 655 516 546</span>
                <span className="text-xs text-gray-400">Governing Law: New South Wales</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 sm:px-10 py-8 sm:py-10">

            {/* Preamble */}
            <div className="mb-10 pb-10 border-b border-gray-100">
              <p className="text-[15px] text-gray-600 leading-relaxed">
                Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using the ConnecTradie platform (&ldquo;Platform&rdquo;). These Terms constitute a binding legal agreement between you and ConnecTradie Pty Ltd. By creating an account or using the Platform, you confirm that you have read, understood, and agree to be bound by these Terms and our{' '}
                <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">Privacy Policy</Link>, which is incorporated by reference. If you do not agree, you must not use the Platform.
              </p>
              <div className="mt-5 flex items-start gap-3 bg-blue-50/70 border border-blue-100 rounded-xl p-4">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong className="font-semibold">Legal Notice:</strong> These Terms are subject to the Australian Consumer Law (ACL) and the Competition and Consumer Act 2010 (Cth). Nothing in these Terms excludes rights that cannot be excluded by law.
                </p>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-10">

              {/* Section 1 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">1.</span> Nature of Our Service & Relationship
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie provides a digital marketplace platform connecting homeowners (&ldquo;Clients&rdquo;) with independent service providers (&ldquo;Tradies&rdquo;). By using this Platform, you acknowledge:
                </p>
                <ul className="mt-4 space-y-3">
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Facilitation Only:</strong> ConnecTradie is a facilitator and is not a party to any agreement, contract, or job initiated between Clients and Tradies.</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Independence:</strong> No agency, partnership, joint venture, or employer-employee relationship is created between ConnecTradie and any user.</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Contractual Separation:</strong> Any contract for work is strictly a private agreement between the Client and the Tradie. ConnecTradie is not liable under any such agreement.</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">No Guarantee:</strong> ConnecTradie does not warrant the availability, quality, suitability, or legality of any Tradie, service, or job posted on the Platform. Clients must perform their own due diligence.</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Platform Modification:</strong> ConnecTradie may modify, suspend, or discontinue any aspect of the Platform at any time, with reasonable notice where practicable.</span>
                  </li>
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Section 2 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">2.</span> Tradie Warranties & Verification
                </h2>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">2.1 Credential Warranty</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Tradies warrant that, at all times while operating on the Platform, they hold: a valid ABN; current trade licences and professional qualifications required by Australian law; and any other permits or certifications required for their services. Tradies must notify ConnecTradie within 7 days if any credential expires, is suspended, or revoked.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">2.2 Insurance Requirement</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Tradies must maintain active Public Liability Insurance of at least $5,000,000 AUD per occurrence at all times. Tradies must provide proof upon request and notify ConnecTradie in writing within 7 days of any lapse, cancellation, or material change. Failure to comply results in immediate account suspension.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">2.3 Verification Limitation</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Verification by ConnecTradie is a point-in-time check only. It is not an endorsement of quality or suitability and does not guarantee ongoing compliance. Clients are encouraged to independently verify credentials with the relevant licensing authority.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 3 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">3.</span> Payments, Fees, Platform Integrity & Payment Security
                </h2>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">3.1 Secure Payment Model</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Upon a Client accepting a quote, the agreed amount is secured via Stripe, our third-party payment processor. ConnecTradie does not hold client funds at any time. Funds are released to the Tradie upon Client confirmation of satisfactory completion, or automatically after 7 business days if no dispute is raised.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">3.2 Secure Processing</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      All transactions use encrypted third-party processors. ConnecTradie does not store full payment card details.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">3.3 Non-Circumvention</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Users must not arrange or accept payment outside the Platform for any job originating through ConnecTradie (including cash, direct bank transfer, or third-party platforms).
                    </p>
                    <div className="mt-3 bg-amber-50 border-l-4 border-amber-400 pl-4 py-3 pr-4 rounded-r-lg">
                      <p className="text-sm text-amber-900">
                        <strong>Consequence:</strong> Violation results in permanent account termination and forfeiture of all Platform protections.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">3.4 Profile Visibility & Anti-Circumvention</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Free-tier Tradies display first name and last initial only, and may not share contact details in messages, quotes, or profiles. Pro-tier Tradies may display their full business name. All users must communicate through Platform channels until a job is secured and funded. Breaching these rules constitutes a material breach of these Terms.
                    </p>
                    <div className="mt-3 bg-amber-50 border-l-4 border-amber-400 pl-4 py-3 pr-4 rounded-r-lg">
                      <p className="text-sm text-amber-900">
                        <strong>Consequence:</strong> Breaching profile visibility or anti-circumvention rules may result in account suspension or permanent termination.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">3.5 Service Fees & GST</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Platform fees are displayed inclusive of GST (10%). Fees are non-refundable except as required by ACL. Fee changes require 30 days written notice.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 4 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">4.</span> Limitation of Liability & Indemnity
                </h2>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.1 ACL Safe-Harbour</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Nothing in these Terms excludes rights under the Australian Consumer Law that cannot lawfully be excluded.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.2 Exclusion of Liability</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      To the maximum extent permitted by law, ConnecTradie is not liable for:
                    </p>
                    <ul className="mt-3 space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>No-shows, cancellations, or poor workmanship by Tradies;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Personal injury or property damage caused by a Tradie;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Indirect, consequential, or economic loss; or</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Loss arising from reliance on profiles, reviews, or verification status.</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.3 Aggregate Liability Cap</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      ConnecTradie&rsquo;s total liability is limited to service fees paid in the 6 months preceding the claim, with a minimum floor of $100 AUD.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.4 Indemnity</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      You agree to indemnify ConnecTradie against claims arising from:
                    </p>
                    <ul className="mt-3 space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Your breach of these Terms;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Your conduct on the Platform;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Infringement of third-party rights; or</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>False or misleading information provided.</span>
                      </li>
                    </ul>
                    <p className="text-[15px] text-gray-600 leading-relaxed mt-3">
                      This indemnity does not apply where claims arise from ConnecTradie&rsquo;s own gross negligence or fraud.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 5 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">5.</span> User Conduct & Account Termination
                </h2>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">5.1 Prohibited Conduct</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">Users must not:</p>
                    <ul className="mt-3 space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Provide false or fraudulent information;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Harass or abuse other users;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Attempt to circumvent Platform security or payments;</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Post false reviews; or</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span>Undermine the integrity of the community.</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">5.2 Suspension & Termination</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      ConnecTradie may suspend or terminate accounts where there are reasonable grounds to believe a breach has occurred. Notice and opportunity to respond will be provided where practicable, except in cases of fraud or serious misconduct.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">5.3 Right of Appeal</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Suspended users may appeal in writing to{' '}
                      <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">admin@connectradie.com</a>{' '}
                      within 14 days. ConnecTradie will respond within 10 business days. Tradies with escrowed funds for completed work may request release of those funds during a suspension review.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 6 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">6.</span> Intellectual Property & User Content
                </h2>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">6.1 Ownership</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      All ConnecTradie intellectual property is the exclusive property of ConnecTradie Pty Ltd.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">6.2 User Content Licence</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      By uploading content, you grant ConnecTradie a perpetual, worldwide, royalty-free licence to use, reproduce, and display it for operating and marketing the Platform. You may request deletion of your User Content upon account closure, subject to legal retention requirements. This licence survives account termination.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">6.3 Your Warranties</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      You warrant that User Content does not infringe third-party rights and that you have all necessary permissions.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 7 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">7.</span> Privacy
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie collects and uses personal information in accordance with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. This includes ABNs, licence numbers, identity documents, and financial data. Our full{' '}
                  <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">Privacy Policy</Link>{' '}
                  is available on our website.
                </p>
                <p className="text-[15px] text-gray-600 leading-relaxed mt-3">
                  In the event of a notifiable data breach, ConnecTradie will notify affected users and the OAIC within 30 days of becoming aware. By using the Platform, you consent to collection and use of personal information as set out in the Privacy Policy.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 8 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">8.</span> Force Majeure
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie is not liable for failures caused by events beyond its reasonable control, including natural disasters, government acts, pandemics, cyberattacks, or third-party outages. If a Force Majeure event continues for more than 60 consecutive days, either party may terminate their account without penalty.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 9 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">9.</span> Amendments to These Terms
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie may amend these Terms. Material changes (including fee increases, liability cap changes, or new non-circumvention clauses) require 30 days written notice via the Platform or email. Continued use after the effective date constitutes acceptance. If you do not accept, you must cease using the Platform.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 10 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">10.</span> Dispute Resolution
                </h2>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-gray-800 mb-1">Direct Negotiation</h3>
                      <p className="text-[15px] text-gray-600 leading-relaxed">
                        Parties must attempt resolution directly within 14 days.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-gray-800 mb-1">Internal Mediation</h3>
                      <p className="text-[15px] text-gray-600 leading-relaxed">
                        If unresolved, notify ConnecTradie at{' '}
                        <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">admin@connectradie.com</a>.
                        ConnecTradie will facilitate negotiation for 30 days.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-gray-800 mb-1">External Resolution</h3>
                      <p className="text-[15px] text-gray-600 leading-relaxed">
                        If still unresolved, parties may refer to an accredited mediator/arbitrator, or either party may proceed to litigation after 14 days.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <h3 className="text-[15px] font-semibold text-gray-800 mb-1">Governing Law</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    These Terms are governed by the laws of New South Wales, Australia. The parties submit to the exclusive jurisdiction of NSW courts. Nothing in this clause prevents either party from bringing a claim in NCAT or the relevant small claims tribunal.
                  </p>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 11 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">11.</span> General Provisions
                </h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">Severability:</strong> Invalid provisions will be severed with minimum effect on the remainder.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">Entire Agreement:</strong> These Terms, Privacy Policy, and supplementary policies constitute the entire agreement.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">Waiver:</strong> Failure to enforce a right is not a waiver of that right.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">No Assignment by Users:</strong> You may not assign rights without ConnecTradie&rsquo;s written consent.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">ConnecTradie Assignment:</strong> ConnecTradie may assign rights in connection with a merger, acquisition, or asset sale, with 30 days written notice.</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Contact */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Contact</h2>
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <p className="font-semibold text-gray-900">ConnecTradie Pty Ltd</p>
                <p className="text-gray-600 mt-1.5">
                  <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">admin@connectradie.com</a>
                </p>
                <p className="text-sm text-gray-500 mt-1">ABN: 75 655 516 546</p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-6 mb-4">
          &copy; {new Date().getFullYear()} ConnecTradie Pty Ltd. All rights reserved.
        </p>
      </main>
    </div>
  );
}
