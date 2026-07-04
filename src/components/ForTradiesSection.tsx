import { Link } from 'react-router-dom';
import { CalendarDays, Users, MessageSquare, FileText, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';

const problems = [
  {
    icon: AlertTriangle,
    text: 'Two tradies show up to the same site on the same day',
  },
  {
    icon: AlertTriangle,
    text: 'Client texts you — you miss it, they call someone else',
  },
  {
    icon: AlertTriangle,
    text: 'Invoice is three weeks late because you forgot',
  },
  {
    icon: AlertTriangle,
    text: 'Subcontractor doesn\'t know the job details',
  },
];

const solutions = [
  { icon: CalendarDays, text: 'Site Calendar prevents double-bookings' },
  { icon: MessageSquare, text: 'Built-in chat with image sharing' },
  { icon: FileText, text: 'One-click GST invoicing' },
  { icon: Users, text: 'Team assignment per job and phase' },
];

export default function ForTradiesSection() {
  return (
    <section id="for-tradies" className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-6">
            Are You a Tradie?
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-[-0.02em] leading-tight">
            One App. <span className="text-warm-500">Every Part of Your Business.</span>
          </h2>

          <p className="mt-6 text-lg text-gray-400 leading-relaxed">
            Australian trades businesses lose thousands every year to disorganisation. ConnecTradie fixes the root cause.
          </p>
        </div>

        <div className="mt-12 grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Common problems we solve</p>
            <div className="space-y-3">
              {problems.map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.text} className="flex items-center gap-3 text-gray-300">
                    <Icon className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm">{p.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {solutions.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.text} className="flex items-center gap-3 p-3 bg-navy-800 border border-navy-700 rounded-xl">
                  <div className="w-9 h-9 bg-emerald-900/30 border border-emerald-800 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-300">{s.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 max-w-2xl mx-auto p-5 bg-navy-800 rounded-xl border border-navy-700">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Keep more of every job.</p>
              <p className="text-gray-400 text-sm mt-1">
                No per-lead fees. No bidding wars. No chasing the client for payment. Unlimited jobs on every plan — Pro keeps the most of each one.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/register?type=tradie"
            className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
          >
            Start Free — No Credit Card
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
