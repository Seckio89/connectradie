import { Link } from 'react-router-dom';
import { Droplets, Zap, Hammer, Sparkles, ChefHat, UtensilsCrossed, ArrowRight } from 'lucide-react';

const categories = [
  {
    icon: Droplets,
    title: 'Plumbing',
    value: 'plumber',
    subtitle: 'Emergency & Maintenance',
    color: 'sky',
    jobs: '2,400+ tradies',
  },
  {
    icon: Zap,
    title: 'Electrical',
    value: 'electrician',
    subtitle: 'Lic. Required',
    color: 'amber',
    jobs: '1,800+ tradies',
  },
  {
    icon: Hammer,
    title: 'Carpentry & Renovations',
    value: 'carpenter',
    subtitle: 'Build & Repair',
    color: 'orange',
    jobs: '1,200+ tradies',
  },
  {
    icon: Sparkles,
    title: 'End of Lease Cleaning',
    value: 'cleaner',
    subtitle: 'Bond Back Guarantee',
    color: 'teal',
    jobs: '900+ tradies',
  },
  {
    icon: ChefHat,
    title: 'Private Chef',
    value: 'private-chef',
    subtitle: 'Personal & Events',
    color: 'emerald',
    jobs: '300+ chefs',
  },
  {
    icon: UtensilsCrossed,
    title: 'Event Catering',
    value: 'catering',
    subtitle: 'Full Service',
    color: 'rose',
    jobs: '150+ caterers',
  },
];

const colorClasses = {
  sky: {
    bg: 'bg-sky-50',
    bgHover: 'group-hover:bg-sky-100',
    icon: 'text-sky-600',
    border: 'border-sky-200',
  },
  amber: {
    bg: 'bg-amber-50',
    bgHover: 'group-hover:bg-amber-100',
    icon: 'text-amber-600',
    border: 'border-amber-200',
  },
  orange: {
    bg: 'bg-orange-50',
    bgHover: 'group-hover:bg-orange-100',
    icon: 'text-orange-600',
    border: 'border-orange-200',
  },
  teal: {
    bg: 'bg-teal-50',
    bgHover: 'group-hover:bg-teal-100',
    icon: 'text-teal-600',
    border: 'border-teal-200',
  },
  emerald: {
    bg: 'bg-emerald-50',
    bgHover: 'group-hover:bg-emerald-100',
    icon: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  rose: {
    bg: 'bg-rose-50',
    bgHover: 'group-hover:bg-rose-100',
    icon: 'text-rose-600',
    border: 'border-rose-200',
  },
};

export default function CategoriesSection() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Popular Trade Categories
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Find verified professionals across Australia's most in-demand trades.
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
                className={`group relative ${colors.bg} ${colors.bgHover} rounded-2xl p-6 border ${colors.border} transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <Icon className={`w-7 h-7 ${colors.icon}`} />
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {category.title}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
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
            className="inline-flex items-center gap-2 text-primary-600 font-semibold hover:text-primary-700 transition-colors"
          >
            View All Categories
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
