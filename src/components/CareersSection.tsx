import { Link } from 'react-router-dom';
import { GraduationCap, Award, Briefcase, ArrowRight } from 'lucide-react';

/**
 * Tertiary landing beat (bottom of the scroll, least emphasis): ConnecTradie
 * also runs Trade Careers — post apprenticeships and roles, get applications
 * from local tradies. Deliberately compact (a single band, no large visual)
 * so it sits below the software and marketplace beats. Roles mirror the real
 * ROLE_FILTERS in TradeCareers (apprentice / qualified / senior).
 */
const roles = [
  { icon: GraduationCap, label: 'Apprenticeships' },
  { icon: Briefcase, label: 'Qualified tradies' },
  { icon: Award, label: 'Senior roles' },
];

export default function CareersSection() {
  return (
    <section id="careers" className="py-16 lg:py-20 bg-navy-900 border-t border-navy-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-navy-800 border border-navy-700 rounded-2xl p-8 lg:p-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a2740] text-[#cbd5e1] border border-white/10 rounded-full text-sm font-semibold mb-5">
            <GraduationCap className="w-4 h-4 text-warm-400" />
            Trade careers
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-[-0.02em]">
            Growing your crew? <span className="text-warm-500">Hire your next apprentice.</span>
          </h2>

          <p className="mt-4 text-base text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Post apprenticeships, qualified and senior roles — and get applications from local tradies, right inside the app you already run your business in.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {roles.map((r) => {
              const Icon = r.icon;
              return (
                <span
                  key={r.label}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a2740] border border-white/10 text-sm font-medium text-[#cbd5e1]"
                >
                  <Icon className="w-4 h-4 text-warm-400" />
                  {r.label}
                </span>
              );
            })}
          </div>

          <div className="mt-8">
            <Link
              to="/register?type=tradie"
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 active:scale-95"
            >
              Post a role — free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
