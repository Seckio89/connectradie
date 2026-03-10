import { Link } from 'react-router-dom';
import { UserPlus, CalendarDays, Users, FileText, ArrowRight } from 'lucide-react';

const tradieSteps = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Sign Up & Set Up',
    description: 'Create your business profile, add your trade categories, verify your license and ABN. Takes 10 minutes.',
    color: 'primary',
  },
  {
    number: '02',
    icon: CalendarDays,
    title: 'Add Your Jobs',
    description: 'Accept leads from clients or add your own jobs. Set scheduled dates and they appear on your Site Calendar.',
    color: 'blue',
  },
  {
    number: '03',
    icon: Users,
    title: 'Assign Your Team',
    description: 'Add your employees and subcontractors. Assign them to jobs and phases. Get conflict warnings automatically.',
    color: 'green',
  },
  {
    number: '04',
    icon: FileText,
    title: 'Invoice & Get Paid',
    description: 'Generate professional GST invoices from your completed jobs in one click. Track payments easily.',
    color: 'amber',
  },
];

const colorClasses = {
  primary: { bg: 'bg-gray-800', text: 'text-indigo-600', light: 'bg-navy-700' },
  blue: { bg: 'bg-gray-800', text: 'text-blue-600', light: 'bg-navy-700' },
  green: { bg: 'bg-gray-800', text: 'text-emerald-600', light: 'bg-navy-700' },
  amber: { bg: 'bg-gray-800', text: 'text-amber-500', light: 'bg-navy-700' },
};

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-5">
            Tradie Quick Start
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            From Sign-Up to <span className="text-warm-500">Fully Organised</span> in Under 30 Minutes
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            No complex setup. No training required. Built for tradies who want to get back to work fast.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-[52px] left-[12.5%] right-[12.5%] border-t-2 border-dashed border-navy-700" />

          <div className="grid lg:grid-cols-4 gap-8">
            {tradieSteps.map((step, index) => {
              const Icon = step.icon;
              const colors = colorClasses[step.color as keyof typeof colorClasses];

              return (
                <div key={step.number} className="relative">
                  <div className="bg-navy-800 rounded-lg p-6 border border-navy-700 hover:border-warm-500 transition-all text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className={`relative w-16 h-16 ${colors.light} rounded-2xl flex items-center justify-center`}>
                        <Icon className={`w-8 h-8 ${colors.text}`} />
                        <div className={`absolute -top-2 -right-2 w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
                          {step.number}
                        </div>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{step.description}</p>

                    {index < tradieSteps.length - 1 && (
                      <div className="hidden lg:flex absolute top-[52px] -right-5 w-10 h-10 bg-navy-800 rounded-full border border-navy-700 items-center justify-center z-10">
                        <ArrowRight className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link
            to="/register?type=tradie"
            className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-3 text-sm text-gray-500">No credit card required · Free forever plan available</p>
        </div>
      </div>
    </section>
  );
}
