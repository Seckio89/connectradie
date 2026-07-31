import { Shield, Lock, MessageSquare, Eye, Star, FileText } from 'lucide-react';

const features = [
  {
    icon: Lock,
    title: 'Payment Protection on Every Job',
    description: 'Your payment is held securely by Stripe until you approve the completed work. No risk to you.',
    color: 'text-ct-amber',
    bg: 'bg-ct-teal/10 border-ct-teal/20',
  },
  {
    icon: Shield,
    title: 'Pre-Vetted Tradies Only',
    description: 'Every tradie is ABN-verified and license-checked before they appear. No self-reported credentials.',
    color: 'text-ct-teal',
    bg: 'bg-ct-teal/10 border-ct-teal/20',
  },
  {
    icon: MessageSquare,
    title: 'Direct Chat. No Middleman.',
    description: 'Message your tradie, share photos, and get updates in one thread. Everything stays on record.',
    color: 'text-ct-mute',
    bg: 'bg-ct-surface-2/10 border-ct-teal/20',
  },
  {
    icon: Eye,
    title: 'Real-Time Job Tracking',
    description: 'See where your project stands — milestones, photos, and status updates as work happens.',
    color: 'text-ct-mute-2',
    bg: 'bg-ct-surface-2/10 border-ct-line/20',
  },
  {
    icon: Star,
    title: 'Verified Reviews Only',
    description: 'Every review is tied to a completed, paid job. No fake ratings, no inflated scores.',
    color: 'text-ct-amber',
    bg: 'bg-ct-amber/10 border-ct-amber/[0.34]',
  },
  {
    icon: FileText,
    title: 'GST Invoicing Built In',
    description: 'GST-compliant invoices with full line-item breakdowns and payment tracking. No surprises.',
    color: 'text-ct-teal',
    bg: 'bg-ct-teal/10 border-ct-teal/20',
  },
];

export default function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28 bg-ct-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ct-surface text-ct-mute border border-ct-line rounded-full text-sm font-semibold mb-5">
            Built for Trust
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-ct-paper tracking-[-0.02em]">
            Everything You Need to Hire <span className="text-ct-teal">Without the Risk.</span>
          </h2>
          <p className="mt-4 text-lg text-ct-mute">
            Secure payments, verified tradies, direct communication, and full transparency — all in one platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative bg-ct-surface rounded-ct-md p-8 border border-ct-line hover:border-ct-teal/50 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-ct-md ${feature.bg} border mb-5`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-ct-paper mb-2">{feature.title}</h3>
                <p className="text-sm text-ct-mute leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
