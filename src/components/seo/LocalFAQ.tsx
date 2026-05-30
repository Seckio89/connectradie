// ─────────────────────────────────────────────────────────────────────────────
// LocalFAQ — collapsible FAQ block surfaced on landing pages.
//
// The wrapped content is also emitted as FAQPage JSON-LD higher up the tree
// so Google can render rich-result Q&A snippets directly in search results.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import type { TradeFAQ } from '../../lib/seoContent/tradeContent';

interface LocalFAQProps {
  faqs: TradeFAQ[];
  heading?: string;
}

export default function LocalFAQ({ faqs, heading = 'Frequently asked questions' }: LocalFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-secondary-50 flex items-center justify-center flex-shrink-0">
          <HelpCircle className="w-5 h-5 text-secondary-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">{heading}</h2>
      </div>

      <div className="space-y-2">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900 text-sm sm:text-base">
                  {faq.q}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
