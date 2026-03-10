import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  TrendingUp,
  Unlock,
  Briefcase,
  FileText,
  Calendar,
  CalendarRange,
  Layers,
  BadgeCheck,
  Percent,
  Star,
  Users,
  MessageSquare,
  Shield,
} from 'lucide-react';
import SEO from '../components/SEO';

const freeFeatures = [
  { text: 'Basic profile listing', icon: Users },
  { text: 'Receive direct booking requests', icon: Briefcase },
  { text: 'Up to 5 active jobs at a time', icon: Briefcase },
  { text: '3 lead unlocks per month', icon: Unlock },
  { text: 'Unlimited messaging', icon: MessageSquare },
  { text: 'Verification & credentials', icon: Shield },
  { text: 'Reviews & ratings', icon: Star },
];

const proFeatures = [
  { text: 'Everything in Free, plus:', icon: Check },
  { text: 'Appear in search results', icon: TrendingUp },
  { text: 'Up to 15 lead notifications/month', icon: Unlock },
  { text: 'Full job management tools', icon: Briefcase },
  { text: 'Invoicing & milestone tracking', icon: FileText },
  { text: 'Google Calendar sync', icon: Calendar },
  { text: 'Bulk availability management', icon: CalendarRange },
  { text: 'Project & milestone tracking', icon: Layers },
  { text: 'Verified Pro badge', icon: BadgeCheck },
  { text: '5% platform fee — save 50% vs free', icon: Percent },
  { text: 'Priority over free users in search', icon: Star },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Pricing"
        description="ConnecTradie pricing plans for tradies. Get started free or upgrade to Pro for premium tools, priority leads, and half the platform fees."
        canonical="/pricing"
      />
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Start free and upgrade when you're ready. No lock-in contracts, cancel anytime.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
          {/* Free plan */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Free</h2>
            <p className="text-sm text-gray-500 mb-4">Get started at no cost</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-900">$0</span>
              <span className="text-gray-500 text-sm ml-1">/ month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {freeFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.text} className="flex items-start gap-3">
                    <Icon className="w-4.5 h-4.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature.text}</span>
                  </li>
                );
              })}
            </ul>
            <Link
              to="/register?type=tradie"
              className="block w-full text-center px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro plan */}
          <div className="bg-white rounded-2xl border-2 border-warm-400 p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 bg-warm-500 text-white text-xs font-bold rounded-full">
              <Crown className="w-3.5 h-3.5" />
              MOST POPULAR
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Pro</h2>
            <p className="text-sm text-gray-500 mb-4">For serious tradies ready to grow</p>
            <div className="mb-1">
              <span className="text-4xl font-bold text-gray-900">$45</span>
              <span className="text-gray-500 text-sm ml-1">/ month</span>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              or $36/mo billed annually ($432/year — save 20%)
            </p>
            <ul className="space-y-3 mb-8">
              {proFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.text} className="flex items-start gap-3">
                    <Icon className="w-4.5 h-4.5 text-warm-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature.text}</span>
                  </li>
                );
              })}
            </ul>
            <Link
              to="/register?type=tradie"
              className="block w-full text-center px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
            >
              Start Pro Trial
            </Link>
          </div>
        </div>

        {/* What Pro gives you */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            What You Get with Pro
          </h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <TrendingUp className="w-6 h-6 text-warm-500 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">More Visibility</h3>
              <p className="text-sm text-gray-600">
                Your profile appears in client search results with a verified Pro badge, giving you priority over free users.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <Unlock className="w-6 h-6 text-warm-500 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">More Leads</h3>
              <p className="text-sm text-gray-600">
                Receive up to 15 lead notifications per month so you never miss a job opportunity in your area.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <FileText className="w-6 h-6 text-warm-500 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Professional Tools</h3>
              <p className="text-sm text-gray-600">
                Generate GST invoices, track milestones, manage your team, and sync your schedule with Google Calendar.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <Percent className="w-6 h-6 text-warm-500 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Half the Platform Fees</h3>
              <p className="text-sm text-gray-600">
                Pro members pay just 5% platform fee vs 10% on free. That's 50% more in your pocket on every job.
              </p>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/register?type=tradie"
              className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="mt-3 text-sm text-gray-500">
              No credit card required to start. Upgrade from your dashboard anytime.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
