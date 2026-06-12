import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, FileText as FileTextIcon } from 'lucide-react';
import SEO from '../components/SEO';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Privacy Policy"
        description="ConnecTradie Privacy Policy. How we collect, use, and protect your personal information in accordance with Australian Privacy Law."
        canonical="/privacy"
        lastUpdated="March 2026"
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
              <Lock className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Privacy Policy</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  <FileTextIcon className="w-3 h-3" />
                  Version 1.3
                </span>
                <span className="text-xs text-gray-400">Last Updated: March 2026</span>
                <span className="text-xs text-gray-400">ConnecTradie Pty Ltd</span>
                <span className="text-xs text-gray-400">ABN: 75 655 516 546</span>
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
              <div className="flex items-start gap-3 bg-blue-50/70 border border-blue-100 rounded-xl p-4 mb-5">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong className="font-semibold">Legal Note:</strong> This Policy operates in accordance with the Privacy Act 1988 (Cth), the Australian Privacy Principles (APPs), and the Notifiable Data Breaches (NDB) scheme under Part IIIC of the Privacy Act.
                </p>
              </div>
              <p className="text-[15px] text-gray-600 leading-relaxed">
                By creating an account or using the Platform, you confirm that you have read and understood this Policy and consent to the collection and use of your personal information as described herein. If you do not agree, you must not use the Platform.
              </p>
            </div>

            {/* Sections */}
            <div className="space-y-10">

              {/* Section 1 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">1.</span> Our Commitment to Your Privacy
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie is committed to handling personal information responsibly, transparently, and in accordance with Australian law. We collect only what is reasonably necessary to operate our marketplace, we do not sell personal information, and we take active steps to protect the data entrusted to us by our community. This Policy applies to all users including Clients, Tradies, and website visitors.
                </p>
                <div className="mt-4 bg-amber-50 border-l-4 border-amber-400 pl-4 py-3 pr-4 rounded-r-xl">
                  <p className="text-sm text-amber-900">
                    <strong>Important:</strong> ConnecTradie does not knowingly collect personal information from individuals under the age of 18. If you are under 18, you must not use the Platform.
                  </p>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 2 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">2.</span> Information We Collect & Why
                </h2>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.1 Identity & Contact Information (all users)</h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Full name:</strong> to create and identify your account</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Email address:</strong> to communicate with you and send platform notifications</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Phone number:</strong> to facilitate communication between Clients and Tradies once a job is initiated</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.2 Verification & Professional Credentials (Tradies only)</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed mb-3">
                      To maintain a secure marketplace and issue Verified badges, ConnecTradie collects:
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Australian Business Number (ABN):</strong> verified against the Australian Business Register</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Trade licences and qualifications:</strong> to confirm compliance with Australian law</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Public Liability Insurance details (Certificates of Currency):</strong> to confirm minimum $5,000,000 AUD coverage</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Government-issued identification:</strong> solely to match identity to business credentials</span>
                      </li>
                    </ul>
                    <p className="text-sm text-gray-500 italic mt-3">
                      Verification is a point-in-time check only. ConnecTradie does not use credential data for marketing and does not sell this data to third-party brokers.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.3 Profile & Trust Data</h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Profile photos:</strong> displayed publicly to help Clients identify Tradies</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">User reviews and ratings:</strong> to inform other users&rsquo; decision-making</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Identity verification documents:</strong> where required for enhanced verification tiers</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.4 Financial Data & Secure Payments</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      ConnecTradie facilitates payments through Stripe, our secure third-party payment processor. ConnecTradie does not store full credit card numbers or bank account routing details. Financial data is transmitted directly to Stripe via encrypted tokenisation. We retain transaction records (amount, date, job reference) for legal and tax purposes.
                    </p>
                    <div className="mt-3 flex items-start gap-3 bg-blue-50/70 border border-blue-100 rounded-xl p-4">
                      <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800 leading-relaxed">
                        You are subject to Stripe&rsquo;s Privacy Policy regarding how your financial data is handled. <span className="font-medium">stripe.com/privacy</span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.5 Technical & Usage Data</h3>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">IP addresses and device identifiers:</strong> to prevent fraud and maintain security</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Browser type and operating system:</strong> for platform optimisation</span>
                      </li>
                      <li className="flex items-start gap-3 text-[15px] text-gray-600">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0 mt-2" />
                        <span><strong className="text-gray-800">Usage data and session logs:</strong> to improve platform performance</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-2">2.6 Marketing Communications</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      We may send you service-related notifications and, with your consent, promotional communications about ConnecTradie features and updates. All marketing communications comply with the Spam Act 2003 (Cth). You may opt out at any time via the unsubscribe link in any email or through your account notification settings.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 3 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">3.</span> Public Profile Visibility & Tiered Access
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed mb-3">
                  By using the Platform, you consent to the public display of certain profile information:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Free-Tier Tradies:</strong> first name, last initial, trade category, and verified badges only</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Pro-Tier Tradies:</strong> full registered business name and permitted portfolio details</span>
                  </li>
                </ul>
                <p className="text-[15px] text-gray-600 leading-relaxed mt-3">
                  We will never publicly display your residential address, private phone number, or government-issued ID documents.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 4 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">4.</span> How Your Information Is Shared
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed mb-4">
                  We do not sell, rent, or trade your personal information. Sharing is strictly limited to operating the Platform.
                </p>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.1 Marketplace Connections</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Contact details are shared between Client and Tradie only once a booking is formally initiated through the Platform.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.2 Service Providers & Sub-processors</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed mb-3">
                      We share data with trusted third parties contractually bound to the APPs. Key sub-processors:
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Provider</th>
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Purpose</th>
                            <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Data Location</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-600">
                          <tr className="border-t border-gray-100">
                            <td className="px-4 py-2.5 font-medium text-gray-800">Stripe</td>
                            <td className="px-4 py-2.5">Payment processing & security</td>
                            <td className="px-4 py-2.5">United States, Ireland</td>
                          </tr>
                          <tr className="border-t border-gray-100 bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">Supabase</td>
                            <td className="px-4 py-2.5">Database & backend infrastructure</td>
                            <td className="px-4 py-2.5">United States (AWS)</td>
                          </tr>
                          <tr className="border-t border-gray-100">
                            <td className="px-4 py-2.5 font-medium text-gray-800">ABN Lookup (ATO)</td>
                            <td className="px-4 py-2.5">ABN verification</td>
                            <td className="px-4 py-2.5">Australia</td>
                          </tr>
                          <tr className="border-t border-gray-100 bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">Cloud Infrastructure</td>
                            <td className="px-4 py-2.5">Hosting & storage</td>
                            <td className="px-4 py-2.5">United States / Australia</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.3 Legal & Regulatory Disclosure</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      We may disclose personal information to government bodies, law enforcement, or regulatory authorities where required by Australian law.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">4.4 Overseas Disclosure</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      Some sub-processors store data outside Australia as shown in the table above. We take reasonable steps to ensure recipients handle information consistently with the APPs. By using the Platform, you consent to this potential overseas disclosure.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 5 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">5.</span> Security: Protecting Your Data
                </h2>

                <ul className="space-y-2 mb-5">
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Encryption:</strong> all data encrypted in transit (TLS 1.2+) and at rest (AES-256)</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Access Controls:</strong> only authorised personnel can access sensitive information</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Authentication:</strong> multi-factor authentication available and encouraged</span>
                  </li>
                  <li className="flex items-start gap-3 text-[15px] text-gray-600">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <span><strong className="text-gray-800">Audits & Monitoring:</strong> regular security audits and suspicious activity monitoring</span>
                  </li>
                </ul>

                <div className="space-y-5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">5.1 Notifiable Data Breaches</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      ConnecTradie complies with the NDB scheme. In the event of an eligible data breach likely to cause serious harm, we will notify the OAIC and affected users within 30 days of becoming aware.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-800 mb-1.5">5.2 Do Not Track</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed">
                      ConnecTradie does not currently respond to Do Not Track (DNT) or Global Privacy Control (GPC) browser signals.
                    </p>
                  </div>
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Section 6 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-baseline gap-2">
                  <span className="text-primary-600">6.</span> Your Rights Under Australian Law
                </h2>

                <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide w-36">Right</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">What This Means</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Access</td>
                        <td className="px-4 py-3">Request the personal information we hold about you. We respond within 30 days.</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Correction</td>
                        <td className="px-4 py-3">Request correction of inaccurate or incomplete information. We respond within 30 days.</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Deletion</td>
                        <td className="px-4 py-3">Request deletion of your account and personal data (subject to legal retention obligations in Section 7).</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Data Portability</td>
                        <td className="px-4 py-3">Request an export of your personal data in CSV or JSON format. We respond within 30 days.</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Consent Withdrawal</td>
                        <td className="px-4 py-3">Withdraw consent to non-essential processing (analytics, marketing) at any time via account settings.</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800 align-top">Complaint</td>
                        <td className="px-4 py-3">Lodge a complaint with the OAIC at www.oaic.gov.au or call 1300 363 992.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-[15px] text-gray-600 leading-relaxed">
                  To exercise any of the above rights, contact our Privacy Officer at{' '}
                  <a href="mailto:admin@connectradie.com" className="text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">admin@connectradie.com</a>.
                  We will respond within 30 days.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 7 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">7.</span> Retention of Personal Information & Account Deletion
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed mb-4">
                  When you delete your account we remove your public profile and portfolio data. We are legally required to retain certain records:
                </p>

                <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Data Category</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Retention Period</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700 text-xs uppercase tracking-wide">Legal Basis</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-800">Account data</td>
                        <td className="px-4 py-2.5">Duration + 7 years</td>
                        <td className="px-4 py-2.5">ATO requirements</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">Transaction & financial records</td>
                        <td className="px-4 py-2.5">7 years</td>
                        <td className="px-4 py-2.5">Taxation & corporate law</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-800">Verification documents (Tradies)</td>
                        <td className="px-4 py-2.5">Duration + 2 years</td>
                        <td className="px-4 py-2.5">Risk & compliance</td>
                      </tr>
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">Support & dispute records</td>
                        <td className="px-4 py-2.5">3 years after resolution</td>
                        <td className="px-4 py-2.5">Legal proceedings</td>
                      </tr>
                      <tr className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-800">Marketing consent records</td>
                        <td className="px-4 py-2.5">5 years after opt-out</td>
                        <td className="px-4 py-2.5">Spam Act 2003 (Cth)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-[15px] text-gray-600 leading-relaxed">
                  Where personal information is no longer legally required, we will destroy or de-identify it securely.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 8 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">8.</span> Cookies & Tracking Technologies
                </h2>

                <div className="space-y-3 mb-4">
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">Essential Cookies:</strong> required for core functionality including login and session security. Cannot be disabled without affecting Platform operation.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full flex-shrink-0 mt-2" />
                    <p className="text-[15px] text-gray-600"><strong className="text-gray-800">Analytics Cookies:</strong> used to improve user experience. Non-essential and can be managed via browser settings or account notification settings.</p>
                  </div>
                </div>

                <p className="text-[15px] text-gray-600 leading-relaxed">
                  ConnecTradie does not use cookies to serve third-party advertising. ConnecTradie does not share personal information with advertisers. Our platform is currently ad-free.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 9 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">9.</span> Amendments to This Policy
                </h2>
                <p className="text-[15px] text-gray-600 leading-relaxed">
                  Where changes are material &mdash; including changes to what we collect, how we share information, or your rights &mdash; we will provide at least 30 days written notice via the Platform or your registered email. Continued use after the effective date constitutes acceptance.
                </p>
              </section>

              <hr className="border-gray-100" />

              {/* Section 10 */}
              <section>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-baseline gap-2">
                  <span className="text-primary-600">10.</span> Contact Our Privacy Officer
                </h2>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-500 w-36 flex-shrink-0 font-medium">Privacy Officer</span>
                      <span className="text-sm text-gray-800">The Directors, ConnecTradie Pty Ltd</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-500 w-36 flex-shrink-0 font-medium">Email</span>
                      <a href="mailto:admin@connectradie.com" className="text-sm text-primary-600 hover:text-primary-700 font-medium underline decoration-primary-300 underline-offset-2">admin@connectradie.com</a>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-500 w-36 flex-shrink-0 font-medium">Address</span>
                      <span className="text-sm text-gray-800">ConnecTradie Pty Ltd, Sydney NSW, Australia</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-500 w-36 flex-shrink-0 font-medium">ABN</span>
                      <span className="text-sm text-gray-800">75 655 516 546</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-500 w-36 flex-shrink-0 font-medium">Response Timeframe</span>
                      <span className="text-sm text-gray-800">Within 30 days of receiving your request</span>
                    </div>
                  </div>
                </div>

                <p className="text-[15px] text-gray-600 leading-relaxed mt-4">
                  For complaints not resolved by ConnecTradie, contact the OAIC at{' '}
                  <span className="font-medium text-gray-800">www.oaic.gov.au</span> or call{' '}
                  <span className="font-medium text-gray-800">1300 363 992</span>.
                </p>
              </section>
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
