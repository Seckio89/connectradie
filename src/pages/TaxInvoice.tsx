// ─────────────────────────────────────────────────────────────────────────────
// TaxInvoice — the tax invoice ConnecTradie issues TO a tradie for platform
// commission (pricing spec v2.1 §7A).
//
// NOT the same document as /invoice/:paymentId, which is the tradie's receipt to
// their CLIENT for the job. Here ConnecTradie is the supplier and the tradie is
// the customer, so our ABN sits in the "From" position.
//
// Deliberately mirrors Invoice.tsx's layout, print rules and palette so the two
// documents feel like one system.
//
// Shows commission ONLY. The at-cost materials card-processing pass-through is
// not our revenue and never appears here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COMPANY_ABN, COMPANY_NAME } from '../config/company';

type FeeInvoice = {
  id: string;
  invoice_number: number;
  period_start: string;
  period_end: string;
  subtotal_ex_gst_cents: number;
  gst_cents: number;
  total_cents: number;
  kind: 'invoice' | 'adjustment';
  issued_at: string;
};

type FeeCharge = {
  id: string;
  commission_cents: number;
  ex_gst_cents: number;
  fee_rate_bps: number | null;
  fee_rate_type: string | null;
  charged_at: string;
};

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export default function TaxInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<FeeInvoice | null>(null);
  const [charges, setCharges] = useState<FeeCharge[]>([]);
  const [tradie, setTradie] = useState<{ full_name: string | null; email: string | null; abn_number: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!invoiceId) return;
      try {
        // RLS restricts these to the signed-in tradie's own rows.
        const { data: inv, error: invErr } = await supabase
          .from('platform_fee_invoices')
          .select('id, invoice_number, period_start, period_end, subtotal_ex_gst_cents, gst_cents, total_cents, kind, issued_at, tradie_profile_id')
          .eq('id', invoiceId)
          .maybeSingle();
        if (invErr || !inv) throw new Error('Invoice not found, or it belongs to another account.');
        setInvoice(inv as unknown as FeeInvoice);

        const [{ data: lines }, { data: profile }] = await Promise.all([
          supabase
            .from('platform_fee_charges')
            .select('id, commission_cents, ex_gst_cents, fee_rate_bps, fee_rate_type, charged_at')
            .eq('invoice_id', invoiceId)
            .order('charged_at', { ascending: true }),
          supabase
            .from('profiles')
            .select('full_name, email, abn_number')
            .eq('id', (inv as { tradie_profile_id: string }).tradie_profile_id)
            .maybeSingle(),
        ]);
        setCharges((lines ?? []) as FeeCharge[]);
        setTradie((profile ?? null) as typeof tradie);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this invoice.');
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white sm:bg-gray-50">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex flex-col bg-white sm:bg-gray-50 p-6">
        <Link
          to="/payouts"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors min-h-[44px] self-start mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Can't load invoice</h1>
            <p className="text-sm text-gray-600">{error || 'Invoice data is missing.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isAdjustment = invoice.kind === 'adjustment';
  const singleDay = invoice.period_start === invoice.period_end;
  const periodLabel = singleDay
    ? shortDate(invoice.period_start)
    : `${shortDate(invoice.period_start)} – ${shortDate(invoice.period_end)}`;

  return (
    <div
      className="invoice-page min-h-screen bg-white sm:bg-gray-50 py-6 sm:py-8 px-4 print:py-0 print:px-0 print:bg-white"
      style={{ backgroundColor: 'white', color: 'black' }}
    >
      {/* Actions — hidden when printing */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/payouts"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 sm:p-12 print:border-0 print:rounded-none print:p-6 print:max-w-none print:shadow-none">
        {/* Header — the literal words "Tax Invoice" are an ATO requirement */}
        <div className="flex items-start justify-between pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAdjustment ? 'Adjustment Note' : 'Tax Invoice'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isAdjustment ? 'ADJ' : 'INV'}-{invoice.invoice_number}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-gray-500">Issued</p>
            <p className="text-gray-900 font-medium">{shortDate(invoice.issued_at)}</p>
          </div>
        </div>

        {/* Parties — ConnecTradie is the supplier on this document */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 border-b border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">From</p>
            <p className="text-sm font-semibold text-gray-900">{COMPANY_NAME}</p>
            <p className="text-sm text-gray-600">ABN: {COMPANY_ABN}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Billed to</p>
            <p className="text-sm font-semibold text-gray-900">{tradie?.full_name || 'Your account'}</p>
            {tradie?.abn_number && <p className="text-sm text-gray-600">ABN: {tradie.abn_number}</p>}
            {tradie?.email && <p className="text-sm text-gray-600">{tradie.email}</p>}
            <p className="text-sm text-gray-600 mt-1">Period: {periodLabel}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 font-semibold text-gray-500 uppercase tracking-wide text-xs">Description</th>
                <th className="text-right pb-2 font-semibold text-gray-500 uppercase tracking-wide text-xs">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {charges.length === 0 ? (
                <tr>
                  <td className="py-3 text-gray-600">Platform commission</td>
                  <td className="py-3 text-right text-gray-900">{money(invoice.subtotal_ex_gst_cents)}</td>
                </tr>
              ) : (
                charges.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3">
                      <p className="text-gray-900">
                        Platform commission
                        {c.fee_rate_bps ? ` — ${(c.fee_rate_bps / 100).toFixed(c.fee_rate_bps % 100 === 0 ? 0 : 1)}% of labour` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {shortDate(c.charged_at)}
                        {c.fee_rate_type === 'repeat_client' ? ' · repeat-client rate' : ''}
                      </p>
                    </td>
                    <td className="py-3 text-right text-gray-900">{money(c.ex_gst_cents)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="pt-3 text-gray-600">Subtotal (ex. GST)</td>
                <td className="pt-3 text-right text-gray-900">{money(invoice.subtotal_ex_gst_cents)}</td>
              </tr>
              <tr>
                <td className="pt-1.5 text-gray-600">GST (10%)</td>
                <td className="pt-1.5 text-right text-gray-900">{money(invoice.gst_cents)}</td>
              </tr>
              <tr>
                <td className="pt-3 text-base font-bold text-gray-900">Total</td>
                <td className="pt-3 text-right text-base font-bold text-gray-900">
                  {money(invoice.total_cents)} AUD
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* What this does and doesn't cover — same wording as the explainer */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            This covers our commission on your labour only — we charge nothing on your materials.
            Card processing on materials is passed through at cost and is not part of this invoice.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-6 mt-6 border-t border-gray-200 text-xs text-gray-400">
          <p>
            Already deducted from your payout — nothing further is owed. GST shown separately as
            required by the ATO. {COMPANY_NAME} ABN {COMPANY_ABN}.
          </p>
          <p className="mt-1">
            If you're GST-registered you can claim the GST component back on your BAS.
          </p>
        </div>
      </div>
    </div>
  );
}
