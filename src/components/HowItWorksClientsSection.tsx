import { Link } from 'react-router-dom';
import { FileText, Users, CheckCircle2, ArrowRight } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: FileText,
    title: 'Describe Your Job',
    description: 'Tell us what you need, where, and when. Takes under 2 minutes to post.',
    color: 'primary',
  },
  {
    number: '02',
    icon: Users,
    title: 'Get Quotes from Verified Tradies',
    description: 'Licensed, reviewed professionals respond with pricing and availability.',
    color: 'blue',
  },
  {
    number: '03',
    icon: CheckCircle2,
    title: 'Hire with Confidence',
    description: 'Compare quotes, read reviews, chat directly, and track progress start to finish.',
    color: 'green',
  },
];

const colorClasses = {
  primary: { bg: 'bg-primary-600', text: 'text-primary-600', light: 'bg-primary-100' },
  blue: { bg: 'bg-blue-600', text: 'text-blue-600', light: 'bg-blue-100' },
  green: { bg: 'bg-green-600', text: 'text-green-600', light: 'bg-green-100' },
};

export default function HowItWorksClientsSection() {
  return (
    <section id="how-it-works-clients" className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold mb-5 border border-gray-200">
            For Homeowners & Property Managers
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            From Job Post to Hired in 3 Simple Steps
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            No endless phone calls. No guesswork. Post once, and let qualified tradies come to you.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-[52px] left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-primary-300 via-blue-300 to-green-300" />

          <div className="grid lg:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const colors = colorClasses[step.color as keyof typeof colorClasses];

              return (
                <div key={step.number} className="relative">
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow text-center">
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

                    {index < steps.length - 1 && (
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
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
          >
            Post a Job Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-3 text-sm text-gray-500">No cost to post. Compare quotes before you commit.</p>
        </div>
      </div>
    </section>
  );
}
