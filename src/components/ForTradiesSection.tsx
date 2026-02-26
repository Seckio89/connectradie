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
    <section id="for-tradies" className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="relative order-2 lg:order-1">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4">
                <p className="text-white font-semibold text-sm">Site Calendar — Week View</p>
                <p className="text-gray-400 text-xs mt-0.5">Mon 12 – Sun 18 May 2025</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { day: 'Mon 12', job: 'Bathroom reno — Parramatta', team: ['J', 'K'], time: 'Morning', color: 'bg-primary-50 border-primary-200 text-primary-800' },
                  { day: 'Tue 13', job: 'Electrical switchboard — Penrith', team: ['M'], time: 'Afternoon', color: 'bg-amber-50 border-amber-200 text-amber-800' },
                  { day: 'Wed 14', job: 'Roof inspection — Blacktown', team: ['J', 'K', 'L'], time: 'Morning', color: 'bg-blue-50 border-blue-200 text-blue-800' },
                  { day: 'Thu 15', job: 'Kitchen fit-out — Campbelltown', team: ['M', 'K'], time: 'Full Day', color: 'bg-green-50 border-green-200 text-green-800' },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${item.color}`}>
                    <div className="flex-shrink-0 w-12 text-xs font-semibold opacity-70">{item.day}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.job}</p>
                      <p className="text-xs opacity-60">{item.time}</p>
                    </div>
                    <div className="flex -space-x-1 flex-shrink-0">
                      {item.team.map((initial, j) => (
                        <div key={j} className="w-6 h-6 rounded-full bg-white border-2 border-current flex items-center justify-center">
                          <span className="text-[9px] font-bold">{initial}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <p className="text-xs text-orange-700 font-medium">Fri 16: 2 jobs at same address — conflict detected</p>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-6">
              Are You a Tradie?
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
              One App.<br />
              <span className="text-primary-600">Every Part of Your Business.</span>
            </h2>

            <p className="mt-6 text-lg text-gray-600 leading-relaxed">
              Australian trades businesses lose thousands every year to disorganisation. ConnecTradie fixes the root cause.
            </p>

            <div className="mt-6 space-y-2.5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Common problems we solve:</p>
              {problems.map((p) => {
                const Icon = p.icon;
                return (
                  <div key={p.text} className="flex items-center gap-3 text-gray-700">
                    <Icon className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm">{p.text}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              {solutions.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.text} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                    <div className="w-9 h-9 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-800">{s.text}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 p-5 bg-white rounded-xl border border-gray-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">100% Payout. Zero Platform Fees.</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Every dollar your client pays goes straight to you. No commission, no hidden cuts. Unlimited jobs on Pro.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                to="/register?type=tradie"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
              >
                Start Free — No Credit Card
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
