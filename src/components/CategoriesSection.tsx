import { Link } from 'react-router-dom';
import { Droplets, Zap, Hammer, Sparkles, Home, TreePine, ArrowRight } from 'lucide-react';

const categories = [
  {
    icon: Droplets,
    title: 'Plumbing',
    value: 'plumber',
    subtitle: 'Emergency & Maintenance',
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
    title: 'Carpentry & Renovations',
    value: 'carpenter',
    subtitle: 'Build & Repair',
    color: 'orange',
    jobs: 'Quoted directly',
  },
  {
    icon: Sparkles,
    title: 'End of Lease Cleaning',
    value: 'cleaner',
    subtitle: 'Bond Back Guarantee',
    color: 'teal',
    jobs: 'Reviewed by tenants',
  },
  {
    icon: Home,
    title: 'Roofing',
    value: 'roofer',
    subtitle: 'Repairs & Restoration',
    color: 'emerald',
    jobs: 'Licensed professionals',
  },
  {
    icon: TreePine,
    title: 'Landscaping',
    value: 'landscaper',
    subtitle: 'Design & Maintenance',
    color: 'rose',
    jobs: 'Book this week',
  },
];

const colorClasses = {
  sky: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-secondary-600',
    border: 'border-navy-700',
  },
  amber: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-amber-500',
    border: 'border-navy-700',
  },
  orange: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-orange-600',
    border: 'border-navy-700',
  },
  teal: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-teal-500',
    border: 'border-navy-700',
  },
  emerald: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-emerald-600',
    border: 'border-navy-700',
  },
  rose: {
    bg: 'bg-navy-800',
    bgHover: 'group-hover:bg-navy-700',
    icon: 'text-rose-500',
    border: 'border-navy-700',
  },
};

export default function CategoriesSection() {
  return (
    <section className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            What Do You <span className="text-warm-500">Need Done?</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Pick a trade. Every result is a verified, licensed professional.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => {
            const Icon = category.icon;
            const colors = colorClasses[category.color as keyof typeof colorClasses];

            return (
              <Link
                key={category.title}
                to={`/search?trade=${category.value}`}
                className={`group relative ${colors.bg} ${colors.bgHover} rounded-lg p-6 border ${colors.border} transition-all duration-300 hover:border-warm-500 hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-navy-700 rounded-xl flex items-center justify-center">
                    <Icon className={`w-7 h-7 ${colors.icon}`} />
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-lg font-semibold text-white mb-1">
                  {category.title}
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  {category.subtitle}
                </p>
                <p className="text-xs font-medium text-gray-500">
                  {category.jobs}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 text-warm-400 font-semibold hover:text-warm-300 transition-colors"
          >
            View All Categories
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
