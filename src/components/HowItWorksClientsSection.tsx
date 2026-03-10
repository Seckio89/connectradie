import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Users, CheckCircle2, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: FileText,
    title: 'Describe Your Job',
    description: 'Tell us what you need, where, and when. Takes under 2 minutes to post.',
    color: 'primary',
    details: [
      'Select your trade category (e.g. plumbing, electrical, carpentry)',
      'Enter your suburb or postcode so nearby tradies can find you',
      'Describe the work needed and your preferred timeline',
      'Add photos to help tradies understand the scope',
    ],
  },
  {
    number: '02',
    icon: Users,
    title: 'Get Quotes from Verified Tradies',
    description: 'Licensed, reviewed professionals respond with pricing and availability.',
    color: 'blue',
    details: [
      'Qualified tradies in your area are notified of your job',
      'Each tradie is ABN-verified and license-checked',
      'Receive quotes with clear pricing — no hidden fees',
      'View each tradie\'s ratings, reviews, and past work',
    ],
  },
  {
    number: '03',
    icon: CheckCircle2,
    title: 'Hire with Confidence',
    description: 'Compare quotes, read reviews, chat directly, and track progress start to finish.',
    color: 'green',
    details: [
      'Compare quotes side-by-side to find the best value',
      'Message tradies directly to ask questions before hiring',
      'Book your preferred tradie and confirm the schedule',
      'Track job progress and pay securely through the platform',
    ],
  },
];

const colorClasses = {
  primary: { bg: 'bg-indigo-600', text: 'text-indigo-600', light: 'bg-indigo-900/30' },
  blue: { bg: 'bg-orange-500', text: 'text-orange-600', light: 'bg-orange-900/30' },
  green: { bg: 'bg-teal-600', text: 'text-teal-600', light: 'bg-teal-900/30' },
};

export default function HowItWorksClientsSection() {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const toggleStep = (number: string) => {
    setExpandedStep(expandedStep === number ? null : number);
  };

  return (
    <section id="how-it-works-clients" className="py-20 lg:py-28 bg-navy-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 rounded-full text-sm font-semibold mb-5 border border-navy-700">
            For Homeowners & Property Managers
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em]">
            From Job Post to Hired in <span className="text-warm-500">3 Simple Steps</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            No endless phone calls. No guesswork. Post once, and let qualified tradies come to you.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-[52px] left-[16.67%] right-[16.67%] border-t-2 border-dashed border-navy-700" />

          <div className="grid lg:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const colors = colorClasses[step.color as keyof typeof colorClasses];
              const isExpanded = expandedStep === step.number;

              return (
                <div key={step.number} className="relative">
                  <button
                    onClick={() => toggleStep(step.number)}
                    className={`w-full bg-navy-800 rounded-lg p-8 border text-center transition-all cursor-pointer ${
                      isExpanded ? 'border-warm-500 shadow-md shadow-black/20' : 'border-navy-700 hover:border-warm-500'
                    }`}
                  >
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

                    {isExpanded && (
                      <ul className="mt-4 text-left space-y-2">
                        {step.details.map((detail, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                            <CheckCircle2 className={`w-4 h-4 ${colors.text} flex-shrink-0 mt-0.5`} />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
                      {isExpanded ? (
                        <>Less detail <ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Learn more <ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </div>
                  </button>

                  {index < steps.length - 1 && (
                    <div className="hidden lg:flex absolute top-[52px] -right-5 w-10 h-10 bg-navy-800 rounded-full border border-navy-700 items-center justify-center z-10">
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
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
