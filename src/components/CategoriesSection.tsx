import { Link } from 'react-router-dom';
import { Droplets, Zap, Hammer, Sparkles, Home, TreePine, ArrowRight } from 'lucide-react';

const categories = [
  {
    icon: Droplets,
    title: 'Plumbing',
    value: 'plumber',
    subtitle: 'Emergency & maintenance',
    color: 'sky',
    jobs: 'Licensed & insured',
  },
  {
    icon: Zap,
    title: 'Electrical',
    value: 'electrician',
    subtitle: 'License-verified',
    color: 'amber',
    jobs: 'Compliance guaranteed',
  },
  {
    icon: Hammer,
    title: 'Carpentry & renovations',
    value: 'carpenter',
    subtitle: 'Build & repair',
    color: 'orange',
    jobs: 'Quoted directly',
  },
  {
    icon: Sparkles,
    title: 'End of lease cleaning',
    value: 'cleaner',
    subtitle: 'Bond back guarantee',
    color: 'teal',
    jobs: 'Reviewed by tenants',
  },
  {
    icon: Home,
    title: 'Roofing',
    value: 'roofer',
    subtitle: 'Repairs & restoration',
    color: 'emerald',
    jobs: 'Licensed professionals',
  },
  {
    icon: TreePine,
    title: 'Landscaping',
    value: 'landscaper',
    subtitle: 'Design & maintenance',
    color: 'rose',
    jobs: 'Book this week',
  },
];

const colorClasses = {
  sky: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-mute-2',
    border: 'border-ct-line',
  },
  amber: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-amber',
    border: 'border-ct-line',
  },
  orange: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-amber',
    border: 'border-ct-line',
  },
  teal: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-teal',
    border: 'border-ct-line',
  },
  emerald: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-teal',
    border: 'border-ct-line',
  },
  rose: {
    bg: 'bg-ct-surface',
    bgHover: 'group-hover:bg-ct-surface-2',
    icon: 'text-ct-rose',
    border: 'border-ct-line',
  },
};

export default function CategoriesSection() {
  return (
    <section className="py-20 lg:py-28 bg-ct-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-ct-paper tracking-[-0.02em]">
            What do you <span className="text-ct-teal">need done?</span>
          </h2>
          <p className="mt-4 text-lg text-ct-mute">
            Pick a trade. Every result is a verified, licensed professional.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => {
            const Icon = category.icon;
            const colors = colorClasses[category.color as keyof typeof colorClasses];

            return (
              <Link
                key={category.title}
                to={`/search?trade=${category.value}`}
                className={`group relative ${colors.bg} ${colors.bgHover} rounded-ct-sm p-6 border ${colors.border} transition-all duration-300 hover:border-ct-teal hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-ct-surface-2 rounded-ct-md flex items-center justify-center">
                    <Icon className={`w-7 h-7 ${colors.icon}`} />
                  </div>
                  <ArrowRight className="w-5 h-5 text-ct-mute group-hover:text-ct-mute group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-lg font-semibold text-ct-paper mb-1">
                  {category.title}
                </h3>
                <p className="text-sm text-ct-mute mb-3">
                  {category.subtitle}
                </p>
                <p className="text-xs font-medium text-ct-mute">
                  {category.jobs}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 text-ct-amber font-semibold hover:text-ct-teal transition-colors"
          >
            View all categories
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
