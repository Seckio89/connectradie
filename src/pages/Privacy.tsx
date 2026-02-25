import { Link } from 'react-router-dom';
import { Wrench, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Privacy Policy"
        description="ConnecTradie privacy policy. Learn how we collect, use and protect your personal information in compliance with Australian Privacy Principles."
        canonical="/privacy"
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: February 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Overview</h2>
            <p className="text-gray-600 leading-relaxed">
              ConnecTradie ("we", "our", "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Platform. We comply with the Australian Privacy Principles (APPs) contained in the Privacy Act 1988 (Cth).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
            <p className="text-gray-600 leading-relaxed mb-3">We collect the following types of personal information:</p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Name, email address, phone number, and postal address</li>
              <li>Trade qualifications, license numbers, and ABN (for Tradies)</li>
              <li>Profile information, photos, and reviews</li>
              <li>Payment and billing information</li>
              <li>Communications sent through the Platform</li>
              <li>Device information, IP address, and usage data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p className="text-gray-600 leading-relaxed mb-3">We use your information to:</p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Provide and maintain the Platform</li>
              <li>Facilitate connections between Clients and Tradies</li>
              <li>Verify Tradie licenses and qualifications</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send important notifications about your account and bookings</li>
              <li>Improve and personalise your experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Information Sharing</h2>
            <p className="text-gray-600 leading-relaxed">
              We do not sell your personal information. We may share your information with: Tradies or Clients you choose to connect with, payment processors to facilitate transactions, government authorities when required by law, and service providers who assist in operating the Platform (subject to confidentiality agreements).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Security</h2>
            <p className="text-gray-600 leading-relaxed">
              We implement industry-standard security measures to protect your information, including encryption in transit and at rest, secure authentication, and regular security audits. However, no method of electronic storage or transmission is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
            <p className="text-gray-600 leading-relaxed">
              Under the Privacy Act, you have the right to: access the personal information we hold about you, request corrections to inaccurate information, request deletion of your personal information (subject to legal retention requirements), and lodge a complaint with the Office of the Australian Information Commissioner (OAIC) if you believe your privacy has been breached.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h2>
            <p className="text-gray-600 leading-relaxed">
              We use essential cookies to operate the Platform and analytics cookies to understand how users interact with it. You can manage cookie preferences through your browser settings. Disabling essential cookies may affect your ability to use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contact Us</h2>
            <p className="text-gray-600 leading-relaxed">
              For privacy-related enquiries or to exercise your rights, contact our Privacy Officer at{' '}
              <a href="mailto:privacy@connecttradie.com.au" className="text-primary-600 hover:text-primary-700">
                privacy@connecttradie.com.au
              </a>{' '}
              or write to: ConnecTradie, Sydney, NSW, Australia.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
