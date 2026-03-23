import { Link } from 'react-router-dom';
import { Shield, Lock, DollarSign, MessageSquare, ArrowRight, CheckCircle2, X } from 'lucide-react';

const comparisons = [
  {
    feature: 'Payment Protection',
    us: 'Escrow — tradie gets paid only when you approve',
    others: 'Pay upfront and hope for the best',
    icon: Lock,
  },
  {
    feature: 'Tradie Verification',
    us: 'ABN + license checked before they can quote',
    others: 'Self-reported credentials, no verification',
    icon: Shield,
  },
  {
    feature: 'Pricing Model',
    us: '$0 to post, $0 to quote — free for both sides',
    others: 'Tradies pay $30–$80 per lead (passed on to you)',
    icon: DollarSign,
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
    <section id="how-it-works-clients" className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 rounded-full text-sm font-semibold mb-5 border border-navy-700">
            Why Switch to ConnecTradie
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            Built Different. <span className="text-warm-500">Here's the Proof.</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            We didn't copy the old model. We replaced it.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          {comparisons.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.feature} className="bg-navy-800 rounded-xl border border-navy-700 p-6 hover:border-warm-500/50 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-warm-500/10 border border-warm-500/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-warm-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{row.feature}</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">ConnecTradie</p>
                      <p className="text-sm text-gray-300">{row.us}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                    <X className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">Other Platforms</p>
                      <p className="text-sm text-gray-400">{row.others}</p>
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
            className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
          >
            Post a Job Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-3 text-sm text-gray-500">No cost to post. Escrow protection included on every job.</p>
        </div>
      </div>
    </section>
  );
}
