import { Shield, Lock, MessageSquare, Eye, Star, FileText } from 'lucide-react';

const features = [
  {
    icon: Lock,
    title: 'Payment Protection on Every Job',
    description: 'Your payment is held securely by Stripe until you approve the completed work. No risk to you.',
    color: 'text-warm-400',
    bg: 'bg-warm-500/10 border-warm-500/20',
  },
  {
    icon: Shield,
    title: 'Pre-Vetted Tradies Only',
    description: 'Every tradie is ABN-verified and license-checked before they appear. No self-reported credentials.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: MessageSquare,
    title: 'Direct Chat. No Middleman.',
    description: 'Message your tradie, share photos, and get updates in one thread. Everything stays on record.',
    color: 'text-secondary-400',
    bg: 'bg-secondary-500/10 border-secondary-500/20',
  },
  {
    icon: Eye,
    title: 'Real-Time Job Tracking',
    description: 'See where your project stands — milestones, photos, and status updates as work happens.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Star,
    title: 'Verified Reviews Only',
    description: 'Every review is tied to a completed, paid job. No fake ratings, no inflated scores.',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
  },
  {
    icon: FileText,
    title: 'GST Invoicing Built In',
    description: 'GST-compliant invoices with full line-item breakdowns and payment tracking. No surprises.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
];

export default function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-5">
            Built for Trust
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            Everything You Need to Hire <span className="text-warm-500">Without the Risk.</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Secure payments, verified tradies, direct communication, and full transparency — all in one platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative bg-navy-800 rounded-xl p-8 border border-navy-700 hover:border-warm-500/50 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.bg} border mb-5`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
