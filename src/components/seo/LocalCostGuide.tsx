// ─────────────────────────────────────────────────────────────────────────────
// LocalCostGuide — cost-range table for a trade in a specific suburb.
//
// Surface this prominently on /find/[trade]/[suburb]. Real local data beats
// hipages\' generic "varies, get quotes" copy and is one of the few areas
// where a younger site can out-rank an entrenched competitor on relevance.
// ─────────────────────────────────────────────────────────────────────────────

import { DollarSign, AlertCircle } from 'lucide-react';
import type { CostGuideRow } from '../../lib/seoContent/tradeContent';

interface LocalCostGuideProps {
  rows: CostGuideRow[];
  tradeLabel: string;
  suburbName: string;
}

function formatPrice(value: number): string {
  return `$${value.toLocaleString('en-AU')}`;
}

export default function LocalCostGuide({ rows, tradeLabel, suburbName }: LocalCostGuideProps) {
  return (
    <section className="bg-ct-surface rounded-ct-lg border border-ct-line p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-ct-sm bg-ct-teal/[0.14] flex items-center justify-center flex-shrink-0">
          <DollarSign className="w-5 h-5 text-ct-teal" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ct-paper">
            What does a {tradeLabel.toLowerCase()} cost in {suburbName}?
          </h2>
          <p className="text-sm text-ct-mute-2 mt-1">
            Typical price ranges for {suburbName}-area work. Always confirm whether GST is included and whether the quote is fixed-price or hourly before work begins.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ct-line">
              <th className="text-left text-xs font-medium text-ct-mute uppercase tracking-wide py-3 pr-4">
                Job
              </th>
              <th className="text-right text-xs font-medium text-ct-mute uppercase tracking-wide py-3 px-4">
                Typical range
              </th>
              <th className="text-right text-xs font-medium text-ct-mute uppercase tracking-wide py-3 pl-4">
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={i < rows.length - 1 ? 'border-b border-ct-line-soft' : ''}
              >
                <td className="py-3 pr-4 align-top">
                  <p className="text-ct-paper font-medium">{row.job}</p>
                  {row.note && (
                    <p className="text-xs text-ct-mute mt-1 max-w-md">
                      {row.note}
                    </p>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-ct-paper whitespace-nowrap align-top">
                  {formatPrice(row.low)}–{formatPrice(row.high)}
                </td>
                <td className="py-3 pl-4 text-right text-ct-mute whitespace-nowrap align-top">
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm">
        <AlertCircle className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ct-paper">
          Ranges reflect typical {suburbName}-area pricing for residential work. Complex jobs, after-hours visits, and premium materials sit at or above the top of each range. The numbers are for orientation only — every quote on ConnecTradie is fixed before you accept it, and the money is secured with Stripe until you sign off.
        </p>
      </div>
    </section>
  );
}
