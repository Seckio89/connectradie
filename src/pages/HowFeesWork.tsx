// ─────────────────────────────────────────────────────────────────────────────
// How fees work — the plain-English explainer (pricing spec v2.1 §0A).
//
// This is canonical copy. The payout breakdown and QuoteFeeDisclosure use the
// SAME wording ("Our fee — 8% of your labour (inc GST)", "Card processing on
// materials — at cost") so what a tradie reads here is literally what they see
// on their money. If you change the wording in one place, change it in all.
//
// Public, no gating. Linked from the quote form's fee line, every payout
// breakdown, and the pricing page.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import SEO from '../components/SEO';

// The worked example, kept as data so the numbers can't drift between the table
// and the prose around it.
const HOT_WATER = {
  total: 2400,
  materials: 1600,
  labour: 800,
  fee: 64,
  cardProcessing: 30.88,
  net: 2305.12,
  repeatFee: 40,
};

const money = (n: number) =>
  `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="py-5 border-b border-gray-200 last:border-0">
      <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{q}</h3>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function HowFeesWork() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="How fees work"
        description="One fee, one side, one moment: 8% of your labour when the job completes — capped, GST claimable, nothing on materials, and cheaper every job you keep with the same client."
        canonical="/how-fees-work"
      />

      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
              </span>
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Pricing
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">How fees work</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            One fee, one side, one moment: a percentage of <span className="font-medium">your labour</span> when
            the job completes. Nothing on materials, nothing to quote, and nothing charged to your client.
          </p>
        </div>

        {/* ── Following one job through the system ── */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Following one job through</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">
            Sarah needs her hot water system replaced. Dave the plumber quotes{' '}
            <span className="font-medium text-gray-900">{money(HOT_WATER.total)}</span>: the unit costs{' '}
            <span className="font-medium text-gray-900">{money(HOT_WATER.materials)}</span> and his labour is{' '}
            <span className="font-medium text-gray-900">{money(HOT_WATER.labour)}</span>. He enters those as two
            numbers when he quotes — that's the only extra step in the whole system.
          </p>

          <ol className="space-y-4 mb-6">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary-100 text-secondary-700 text-xs font-semibold flex items-center justify-center">1</span>
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-900">Sarah accepts and pays {money(HOT_WATER.total)} into escrow.</span>{' '}
                She pays the quote price. Nothing added, no platform fee, no surcharge — clients never pay us
                anything. Her money sits in escrow, which means Dave is guaranteed to get paid the moment the
                job's done. No invoicing, no chasing, no "cheque's in the mail".
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary-100 text-secondary-700 text-xs font-semibold flex items-center justify-center">2</span>
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-900">Dave does the job. Sarah confirms it's done.</span>
              </p>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary-100 text-secondary-700 text-xs font-semibold flex items-center justify-center">3</span>
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-900">The money is released, and it splits like this:</span>
              </p>
            </li>
          </ol>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="py-2.5 text-gray-600">Job total</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-900">{money(HOT_WATER.total)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-gray-600">
                    Our fee — 8% of Dave's <span className="font-medium">labour</span> only (inc GST)
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-gray-900">−{money(HOT_WATER.fee)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-gray-600">Card processing on materials — at cost, ~1.93%</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-900">−{money(HOT_WATER.cardProcessing)}</td>
                </tr>
                <tr className="bg-emerald-50/60">
                  <td className="py-2.5 font-semibold text-gray-900">Dave receives</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-gray-900">{money(HOT_WATER.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-800 leading-relaxed">
              <span className="font-semibold">Next job with Sarah, Dave's fee drops to 5%.</span> Same job again
              next year: the fee is {money(HOT_WATER.repeatFee)}, not {money(HOT_WATER.fee)}. The longer you keep
              a client, the less you pay. Forever.
            </p>
          </div>
        </section>

        {/* ── Why each line is what it is ── */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Why each line is what it is</h2>
          <div className="divide-y divide-gray-200">
            <Faq q="Why only on labour?">
              <p>
                Because the {money(HOT_WATER.materials)} unit isn't Dave's income — he bought it and passed it
                through. Platforms that charge commission on the full job value take $240 from this job; $192 of
                that is a tax on a box Dave bought at the plumbing supplier. We think that's wrong, so we don't
                do it.
              </p>
            </Faq>
            <Faq q="What's the 1.93% on materials then?">
              <p>
                Card processing. When Sarah pays {money(HOT_WATER.total)} by card, the card network charges a fee
                on all of it — that's true everywhere, including on the EFTPOS machine in your van. We pass that
                cost through on the materials portion at exactly what it costs us, with no markup, and we show it
                as its own line so you can see we're not hiding margin in it. On labour, it's already covered
                inside our fee.
              </p>
            </Faq>
            <Faq q="Why does the fee include GST?">
              <p>
                All our prices include GST, no surprises at the bottom of the bill. If you're GST-registered
                (most of you are), you claim that GST back on your BAS — so the 8% fee really costs you{' '}
                <span className="font-medium text-gray-900">7.27%</span>. We give you a tax invoice for every fee
                automatically.
              </p>
            </Faq>
            <Faq q="Is there a maximum?">
              <p>
                Yes — the fee is capped at <span className="font-medium text-gray-900">$500 per job</span> ($400
                on Pro). A big renovation doesn't mean an unlimited bill.
              </p>
            </Faq>
            <Faq q="What's never charged, on any tier?">
              <p>
                Quoting (unlimited, free), seeing jobs, messaging clients, getting paid on standard 2-day payout,
                and disputes. If you don't win the job, you pay nothing at all.
              </p>
            </Faq>
          </div>
        </section>

        {/* ── The whole model in one sentence ── */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">The whole model in one sentence</h2>
          <blockquote className="border-l-2 border-warm-500 pl-4 text-sm text-gray-700 leading-relaxed">
            <span className="font-semibold text-gray-900">
              One fee, one side, one moment: 8% of your labour when the job completes
            </span>{' '}
            — capped, GST claimable, nothing on materials, and cheaper every job you keep with the same client.
          </blockquote>

          <Link
            to="/pricing"
            className="mt-6 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            See the plans <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
