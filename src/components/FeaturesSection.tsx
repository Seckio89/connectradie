import { Shield, BarChart3, MessageSquare, Eye, Star, FileText } from 'lucide-react';

const differentiators = [
  {
    icon: Shield,
    title: 'Pre-Vetted, Not Self-Reported',
    description: 'On other platforms, anyone can sign up. Here, every tradie is ABN-verified and license-checked before they appear.',
    color: 'green',
  },
  {
    icon: BarChart3,
    title: 'No Lead Fees. No Bidding Wars.',
    description: 'Tradies quote you directly. No pay-per-lead model means you get honest pricing, not inflated bids.',
    color: 'blue',
  },
  {
    icon: MessageSquare,
    title: 'Direct Chat. No Phone Tag.',
    description: 'Message your tradie, share photos, and get updates in one thread. Everything stays on record.',
    color: 'primary',
  },
  {
    icon: Eye,
    title: 'Real-Time Job Tracking',
    description: 'See exactly where your project stands — milestones, photos, and status updates as work happens.',
    color: 'amber',
  },
  {
    icon: Star,
    title: 'Reviews from Real Clients Only',
    description: 'Every review is tied to a completed job. No fake ratings, no inflated scores.',
    color: 'orange',
  },
  {
    icon: FileText,
    title: 'Clear Invoicing. No Surprises.',
    description: 'GST-compliant invoices with full line-item breakdowns and payment tracking built in.',
    color: 'teal',
  },
];

const colorClasses = {
  primary: { bg: 'bg-navy-700', icon: 'text-indigo-600', border: 'border-navy-600' },
  green: { bg: 'bg-navy-700', icon: 'text-emerald-600', border: 'border-navy-600' },
  blue: { bg: 'bg-navy-700', icon: 'text-blue-600', border: 'border-navy-600' },
  amber: { bg: 'bg-navy-700', icon: 'text-amber-500', border: 'border-navy-600' },
  teal: { bg: 'bg-navy-700', icon: 'text-teal-600', border: 'border-navy-600' },
  orange: { bg: 'bg-navy-700', icon: 'text-orange-500', border: 'border-navy-600' },
};

export default function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Built Different */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-5">
            Not Another Marketplace
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            Built Different. <span className="text-warm-500">On Purpose.</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            We don't let anyone sign up and start quoting. Every tradie earns their place here.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {differentiators.map((feature) => {
            const Icon = feature.icon;
            const colors = colorClasses[feature.color as keyof typeof colorClasses];

            return (
              <div
                key={feature.title}
                className="group relative bg-navy-800 rounded-lg p-8 border border-navy-700 hover:border-warm-500 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${colors.bg} ${colors.border} border mb-6`}>
                  <Icon className={`w-7 h-7 ${colors.icon}`} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-warm-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
