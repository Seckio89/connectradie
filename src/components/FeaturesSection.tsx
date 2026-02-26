import { Shield, BarChart3, MessageSquare, Eye, Star, FileText } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Verified & Licensed',
    description: 'Every tradie is ABN-verified and license-checked before they can quote. Know who you\'re hiring.',
    color: 'green',
  },
  {
    icon: BarChart3,
    title: 'Compare Quotes',
    description: 'Receive multiple quotes and compare pricing, timelines, and reviews side by side.',
    color: 'blue',
  },
  {
    icon: MessageSquare,
    title: 'Built-in Messaging',
    description: 'Chat with your tradie, share photos, get updates -- all in one place. No phone tag required.',
    color: 'primary',
  },
  {
    icon: Eye,
    title: 'Track Job Progress',
    description: 'See project phases and milestones in real time so you always know where things stand.',
    color: 'amber',
  },
  {
    icon: Star,
    title: 'Honest Reviews',
    description: 'Read real reviews from other homeowners. Leave your own after the job is done.',
    color: 'orange',
  },
  {
    icon: FileText,
    title: 'Professional Invoicing',
    description: 'Receive clear, GST-compliant invoices with full payment tracking. No surprises.',
    color: 'teal',
  },
];

const colorClasses = {
  primary: { bg: 'bg-primary-100', icon: 'text-primary-600', border: 'border-primary-200' },
  green: { bg: 'bg-green-100', icon: 'text-green-600', border: 'border-green-200' },
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600', border: 'border-blue-200' },
  amber: { bg: 'bg-amber-100', icon: 'text-amber-600', border: 'border-amber-200' },
  teal: { bg: 'bg-teal-100', icon: 'text-teal-600', border: 'border-teal-200' },
  orange: { bg: 'bg-orange-100', icon: 'text-orange-600', border: 'border-orange-200' },
};

export default function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold mb-5">
            Built for Peace of Mind
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Why Homeowners Choose Connec<span className="text-blue-600">Tradie</span>
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Every step is designed to give you confidence -- from finding the right tradie to paying the final invoice.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            const colors = colorClasses[feature.color as keyof typeof colorClasses];

            return (
              <div
                key={feature.title}
                className="group relative bg-white rounded-2xl p-8 border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${colors.bg} ${colors.border} border mb-6`}>
                  <Icon className={`w-7 h-7 ${colors.icon}`} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-500 to-primary-600 rounded-b-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
