import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Search, MessageCircle, X } from 'lucide-react';
import SEO from '../components/SEO';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

const faqSections: FAQSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        question: 'What is ConnecTradie?',
        answer:
          'ConnecTradie is Australia\'s trusted marketplace connecting homeowners with verified, licensed tradies. We make it easy to find, compare, and book qualified professionals for any job — from plumbing and electrical to landscaping and cleaning.',
      },
      {
        question: 'How do I create an account?',
        answer:
          'Click "Get Started" on the homepage and choose whether you\'re a Client (homeowner) or a Tradie. Fill in your details, verify your email, and you\'re ready to go. Tradies will also need to provide their ABN and relevant trade licenses during onboarding.',
      },
      {
        question: 'Is ConnecTradie free to use?',
        answer:
          'Creating an account and browsing tradies is completely free for clients. Tradies can use the platform on our free plan with basic features, or upgrade to a Pro plan for enhanced tools like priority leads, advanced analytics, and team management.',
      },
      {
        question: 'Which areas does ConnecTradie cover?',
        answer:
          'ConnecTradie operates across all Australian states and territories. You can search for tradies by suburb, postcode, or region to find professionals servicing your area.',
      },
      {
        question: 'How is ConnecTradie different from other platforms?',
        answer:
          'Two big differences. First, we don\'t run a lead-fee model — tradies don\'t pay just to read your job, so that cost never gets priced back into your quote. Second, we don\'t run an auction — tradies submit one fair quote rather than racing each other to the cheapest number, which tends to attract unverified bidders. Every tradie is ABN and licence verified before they can quote, your payment sits in Stripe-held escrow until you approve the work, and either side can message the other directly with no per-message charge.',
      },
    ],
  },
  {
    title: 'For Homeowners (Clients)',
    items: [
      {
        question: 'How do I find and book a tradie?',
        answer:
          'Use the Search page to browse tradies by trade category and location. View their profiles, check reviews and ratings, then send a booking request or message them directly. Once a tradie accepts, you\'ll be connected to discuss the job details.',
      },
      {
        question: 'Are tradies on ConnecTradie verified?',
        answer:
          'Yes. All tradies are required to provide a valid ABN and relevant trade licenses during registration. We perform initial verification checks, though we recommend clients also confirm license details for their own peace of mind via state licensing authorities.',
      },
      {
        question: 'How do payments work?',
        answer:
          'Payments are processed securely through our integrated payment system powered by Stripe. This ensures both parties are protected. You can pay via credit or debit card, and all transactions are encrypted and secure.',
      },
      {
        question: 'What if I\'m not happy with the work?',
        answer:
          'We encourage you to first communicate any concerns directly with your tradie. If you can\'t resolve the issue, you can use our built-in dispute resolution process. Contact us at admin@connectradie.com and we\'ll help mediate a fair outcome.',
      },
      {
        question: 'Can I leave a review?',
        answer:
          'Absolutely. After a job is completed, you\'ll be prompted to leave a rating and review. Honest reviews help maintain the quality of our community and assist other homeowners in making informed decisions.',
      },
    ],
  },
  {
    title: 'For Tradies',
    items: [
      {
        question: 'How do I set up my tradie profile?',
        answer:
          'After registering as a tradie, complete the onboarding checklist: add your trade categories, upload your ABN and license details, set your service areas, and add a profile photo. A complete profile builds trust and attracts more clients.',
      },
      {
        question: 'How do I receive leads?',
        answer:
          'Clients can find you through search, send booking requests, or post jobs that match your trade categories and service areas. You\'ll receive notifications for new leads and can accept or decline them from your dashboard.',
      },
      {
        question: 'How do payouts work?',
        answer:
          'Payouts are handled through Stripe Connect. Set up your payout account from the Payouts page in your dashboard. Once connected, payments from completed jobs are deposited directly to your nominated bank account on a regular schedule.',
      },
      {
        question: 'What is the Pro plan?',
        answer:
          'The Pro plan gives you access to premium features including priority placement in search results, advanced performance analytics, team management tools, unlimited job listings, and professional invoice generation. You can upgrade from your dashboard at any time.',
      },
      {
        question: 'Can I manage my team on ConnecTradie?',
        answer:
          'Yes. With the team management feature, you can add employees and subcontractors, assign them to jobs and phases, and get automatic scheduling conflict warnings via the Site Calendar.',
      },
    ],
  },
  {
    title: 'Account & Security',
    items: [
      {
        question: 'How do I reset my password?',
        answer:
          'Click "Forgot Password" on the login page and enter your registered email address. You\'ll receive a secure link to create a new password. If you don\'t receive the email, check your spam folder or contact us for assistance.',
      },
      {
        question: 'How is my personal data protected?',
        answer:
          'We take data security seriously. All data is encrypted in transit and at rest, and we follow strict access controls. We comply with the Privacy Act 1988 (Cth) and the Australian Privacy Principles. Read our full Privacy Policy for details.',
      },
      {
        question: 'Can I delete my account?',
        answer:
          'Yes. You can request account deletion by contacting us at admin@connectradie.com. We\'ll process your request in accordance with our Privacy Policy, noting that some financial and tax records may need to be retained as required by law.',
      },
    ],
  },
  {
    title: 'Payments & Billing',
    items: [
      {
        question: 'What payment methods are accepted?',
        answer:
          'We accept all major credit and debit cards (Visa, Mastercard, American Express) through our secure Stripe integration. All payment information is encrypted and never stored on our servers.',
      },
      {
        question: 'Are there any hidden fees?',
        answer:
          'No. Any applicable service or subscription fees are clearly displayed before you commit. ConnecTradie does not charge hidden transaction fees. Our pricing is transparent and straightforward.',
      },
      {
        question: 'How do refunds work?',
        answer:
          'Refund eligibility depends on the circumstances and is handled on a case-by-case basis through our dispute resolution process. Service and subscription fees are generally non-refundable except where required by Australian Consumer Law.',
      },
    ],
  },
];

function FAQAccordion({ item, highlight }: { item: FAQItem; highlight?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const highlightText = (text: string) => {
    if (!highlight?.trim()) return text;
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark> : part
    );
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">{highlightText(item.question)}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-4">
          <p className="text-gray-600 leading-relaxed">{highlightText(item.answer)}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpFAQ() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  const filteredSections = searchQuery.trim()
    ? faqSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.answer.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((section) => section.items.length > 0)
    : faqSections;

  const totalResults = filteredSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Help & FAQs"
        description="Find answers to frequently asked questions about ConnecTradie. Learn how to get started, manage your account, payments, and more."
        canonical="/help"
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help & Frequently Asked Questions</h1>
        <p className="text-gray-600 mb-8">
          Find answers to common questions about using ConnecTradie. Can't find what you're looking for?{' '}
          <Link to="/contact" className="text-primary-600 hover:text-primary-700 font-medium">
            Contact us
          </Link>
          .
        </p>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for answers..."
            className="w-full pl-12 pr-4 py-3.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 transition-all"
          />
          {searchQuery && (
            <p className="mt-2 text-sm text-gray-500">
              {totalResults} result{totalResults !== 1 ? 's' : ''} found
            </p>
          )}
        </div>

        {/* FAQ Sections */}
        <div className="space-y-10">
          {filteredSections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{section.title}</h2>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <FAQAccordion key={item.question} item={item} highlight={searchQuery} />
                ))}
              </div>
            </section>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-1">No results found</h3>
              <p className="text-sm text-gray-500">Try different keywords or browse the categories below</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-sm text-primary-600 font-medium hover:text-primary-700"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        <div className="mt-12 bg-gray-50 rounded-2xl border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Still need help?</h2>
          <p className="text-gray-600 mb-4">
            Our team is here to assist you with any questions or concerns.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
            >
              Contact Us
            </Link>
            <a
              href="mailto:admin@connectradie.com"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Email Support
            </a>
          </div>
        </div>
      </main>

      {/* Floating help panel — opens real contact options. No fake chat. */}
      {showHelpPanel ? (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          <div className="bg-warm-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-white" />
              <span className="text-white font-semibold text-sm">Need help?</span>
            </div>
            <button
              onClick={() => setShowHelpPanel(false)}
              className="text-white/80 hover:text-white"
              aria-label="Close help panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-600">
              We usually reply within one business day. Choose the option that suits you.
            </p>
            <a
              href="mailto:admin@connectradie.com"
              className="block px-4 py-3 bg-warm-500 text-white text-sm font-semibold rounded-lg hover:bg-warm-600 transition-colors text-center"
            >
              Email support
            </a>
            <Link
              to="/contact"
              onClick={() => setShowHelpPanel(false)}
              className="block px-4 py-3 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors text-center"
            >
              Open contact form
            </Link>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowHelpPanel(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-warm-500 text-white rounded-full shadow-lg hover:bg-warm-600 transition-all flex items-center justify-center z-50 hover:scale-105"
          aria-label="Open help options"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
