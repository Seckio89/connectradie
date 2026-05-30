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
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="relative order-2 lg:order-1">
            <div className="bg-navy-800 rounded-2xl shadow-lg shadow-black/20 border border-navy-700 overflow-hidden">
              <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] px-5 py-4">
                <p className="text-white font-semibold text-sm">Site Calendar — Week View</p>
                <p className="text-gray-400 text-xs mt-0.5">Mon 12 – Sun 18 May 2025</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { day: 'Mon 12', job: 'Bathroom reno — Parramatta', team: ['J', 'K'], time: 'Morning', color: 'bg-blue-50 border-blue-200 text-blue-800', conflict: false },
                  { day: 'Tue 13', job: 'Electrical switchboard — Penrith', team: ['M'], time: 'Afternoon', color: 'bg-amber-50 border-amber-200 text-amber-800', conflict: false },
                  { day: 'Wed 14', job: 'Roof inspection — Blacktown', team: ['J', 'K', 'L'], time: 'Morning', color: 'bg-violet-50 border-violet-200 text-violet-800', conflict: false },
                  { day: 'Thu 15', job: 'Kitchen fit-out — Campbelltown', team: ['M', 'K'], time: 'Full Day', color: 'bg-emerald-50 border-emerald-200 text-emerald-800', conflict: false },
                  { day: 'Fri 16', job: 'Bathroom finish — 14 Smith St, Bondi', team: ['J'], time: '8:00 AM – 12:00 PM', color: 'bg-red-50 border-red-300 text-red-800', conflict: true },
                  { day: 'Fri 16', job: 'Tile install — 14 Smith St, Bondi', team: ['K'], time: '9:00 AM – 1:00 PM', color: 'bg-red-50 border-red-300 text-red-800', conflict: true },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${item.color}`}>
                    <div className="flex-shrink-0 w-12 text-xs font-semibold opacity-70">{item.day}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{item.job}</p>
                        {item.conflict && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )}
                      </div>
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
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-medium">Conflict — same address, overlapping time. Reschedule one to clear.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-6">
              Are You a Tradie?
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-[-0.02em] leading-tight">
              One App.<br />
              <span className="text-warm-500">Every Part of Your Business.</span>
            </h2>

            <p className="mt-6 text-lg text-gray-400 leading-relaxed">
              Australian trades businesses lose thousands every year to disorganisation. ConnecTradie fixes the root cause.
            </p>

            <div className="mt-6 space-y-2.5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Common problems we solve:</p>
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

            <div className="mt-8 grid grid-cols-2 gap-3">
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

            <div className="mt-8 p-5 bg-navy-800 rounded-xl border border-navy-700">
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

            <div className="mt-8">
              <Link
                to="/register?type=tradie"
                className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
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
