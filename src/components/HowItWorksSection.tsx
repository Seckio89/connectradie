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
  primary: { bg: 'bg-primary-600', text: 'text-primary-600', light: 'bg-primary-100' },
  blue: { bg: 'bg-blue-600', text: 'text-blue-600', light: 'bg-blue-100' },
  green: { bg: 'bg-green-600', text: 'text-green-600', light: 'bg-green-100' },
  amber: { bg: 'bg-amber-600', text: 'text-amber-600', light: 'bg-amber-100' },
};

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold mb-5">
            Tradie Quick Start
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            From Sign-Up to Fully Organised in Under 30 Minutes
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            No complex setup. No training required. Built for tradies who want to get back to work fast.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-[52px] left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-primary-300 via-blue-300 via-green-300 to-amber-300" />

          <div className="grid lg:grid-cols-4 gap-8">
            {tradieSteps.map((step, index) => {
              const Icon = step.icon;
              const colors = colorClasses[step.color as keyof typeof colorClasses];

              return (
                <div key={step.number} className="relative">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow text-center">
                    <div className="flex items-center justify-center mb-6">
                      <div className={`relative w-16 h-16 ${colors.light} rounded-2xl flex items-center justify-center`}>
                        <Icon className={`w-8 h-8 ${colors.text}`} />
                        <div className={`absolute -top-2 -right-2 w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
                          {step.number}
                        </div>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>

                    {index < tradieSteps.length - 1 && (
                      <div className="hidden lg:flex absolute top-[52px] -right-5 w-10 h-10 bg-white rounded-full border border-gray-200 items-center justify-center z-10">
                        <ArrowRight className="w-4 h-4 text-gray-400" />
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
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
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
