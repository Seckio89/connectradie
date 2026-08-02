import { Link } from 'react-router-dom';
import { Shield, Lock, DollarSign, MessageSquare, Gavel, ArrowRight, CheckCircle2, X } from 'lucide-react';

const comparisons = [
  {
    feature: 'Payment protection',
    us: 'Stripe-secured — tradie gets paid only when you approve',
    others: 'Pay upfront and hope for the best',
    icon: Lock,
  },
  {
    feature: 'Tradie verification',
    us: 'ABN + license checked before they can quote',
    others: 'Self-reported credentials, no verification',
    icon: Shield,
  },
  {
    feature: 'Pricing model',
    us: '$0 to post. $0 for tradies to quote.',
    others: 'Tradies pay just to read your job — and price it into your quote',
    icon: DollarSign,
  },
  {
    feature: 'How tradies quote',
    us: 'One fair quote per tradie — no bidding wars, no race to the bottom',
    others: 'Auction-style: cheapest bid wins, even from unverified accounts',
    icon: Gavel,
  },
  {
    feature: 'Communication',
    us: 'Direct chat — message tradies with no middleman',
    others: 'Platform controls contact, charges for details',
    icon: MessageSquare,
  },
];

export default function HowItWorksClientsSection() {
  return (
    <section id="how-it-works-clients" className="py-20 lg:py-28 bg-ct-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-ct-surface text-ct-mute rounded-full text-sm font-semibold mb-5 border border-ct-line">
            Why switch to ConnecTradie
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-ct-paper tracking-[-0.02em]">
            Built different. <span className="text-ct-teal">Here's the proof.</span>
          </h2>
          <p className="mt-4 text-lg text-ct-mute">
            We didn't copy the old model. We replaced it.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          {comparisons.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.feature} className="bg-ct-surface rounded-ct-md border border-ct-line p-6 hover:border-ct-teal/50 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-ct-sm bg-ct-teal/10 border border-ct-teal/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-ct-amber" />
                  </div>
                  <h3 className="text-lg font-semibold text-ct-paper">{row.feature}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 bg-ct-teal/10 border border-ct-teal/20 rounded-ct-sm">
                    <CheckCircle2 className="w-5 h-5 text-ct-teal shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-ct-teal uppercase tracking-wide mb-1">ConnecTradie</p>
                      <p className="text-sm text-ct-mute-2">{row.us}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-ct-rose/[0.13] border border-ct-rose/10 rounded-ct-sm">
                    <X className="w-5 h-5 text-ct-rose shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-ct-rose uppercase tracking-wide mb-1">Other Platforms</p>
                      <p className="text-sm text-ct-mute">{row.others}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
          >
            Post a job free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-3 text-sm text-ct-mute">No cost to post. Payment protection included on every job.</p>
        </div>
      </div>
    </section>
  );
}
