import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type InvoiceData = {
  id: string;
  amount: number; // cents, ex-GST
  processing_fee: number; // cents
  created_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  invoice_number: number | null;
  job: {
    id: string;
    title: string | null;
    description: string;
    location_address: string | null;
  };
  client: {
    full_name: string;
    email: string;
  };
  tradie: {
    full_name: string;
    email: string;
    abn_number: string | null;
    abn_entity_name: string | null;
    is_gst_registered: boolean;
    address: string | null;
    suburb: string | null;
  };
};

export default function Invoice() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!paymentId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: payment, error: payErr } = await supabase
          .from('payments')
          .select('id, amount, processing_fee, created_at, status, metadata, job_id, profile_id, tradie_id, invoice_number')
          .eq('id', paymentId)
          .maybeSingle();
        if (payErr) throw payErr;
        if (!payment) throw new Error('Invoice not found');

        const [jobRes, clientRes, tradieRes] = await Promise.all([
          supabase.from('jobs').select('id, title, description, location_address').eq('id', payment.job_id).maybeSingle(),
          supabase.from('profiles').select('full_name, email').eq('id', payment.profile_id).maybeSingle(),
          supabase.from('profiles').select('full_name, email, abn_number, abn_entity_name, is_gst_registered, address, suburb').eq('id', payment.tradie_id).maybeSingle(),
        ]);

        if (cancelled) return;
        if (!jobRes.data) throw new Error('Job not found');
        if (!clientRes.data) throw new Error('Client not found');
        if (!tradieRes.data) throw new Error('Tradie not found');

        setData({
          id: payment.id,
          amount: payment.amount,
          processing_fee: payment.processing_fee || 0,
          created_at: payment.created_at,
          status: payment.status,
          metadata: payment.metadata,
          invoice_number: (payment as Record<string, unknown>).invoice_number as number | null,
          job: jobRes.data,
          client: clientRes.data,
          tradie: tradieRes.data,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invoice');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [paymentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Can't load invoice</h1>
          <p className="text-sm text-gray-600">{error || 'Invoice data is missing.'}</p>
        </div>
      </div>
    );
  }

  const baseDollars = data.amount / 100;
  const gstDollars = data.tradie.is_gst_registered ? baseDollars * 0.1 : 0;
  const processingDollars = data.processing_fee / 100;
  const totalDollars = baseDollars + gstDollars + processingDollars;

  const invoiceNumber = data.invoice_number != null
    ? `INV-${String(data.invoice_number).padStart(4, '0')}`
    : `INV-${data.id.slice(0, 8).toUpperCase()}`;
  const issueDate = new Date(data.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const category = data.job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
  const descClean = data.job.description.replace(/^\[[^\]]+\]\s*/, '');
  const jobLabel = data.job.title || category || 'Services rendered';

  const supplierName = data.tradie.abn_entity_name || data.tradie.full_name;
  const supplierLocation = [data.tradie.address, data.tradie.suburb].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:py-0 print:px-0 print:bg-white">
      {/* Print button — hidden when printing */}
      <div className="max-w-3xl mx-auto mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Download / Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 sm:p-12 print:border-0 print:rounded-none print:p-6 print:max-w-none print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {data.tradie.is_gst_registered ? 'Tax Invoice' : 'Invoice'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{invoiceNumber}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-gray-500">Issued</p>
            <p className="text-gray-900 font-medium">{issueDate}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 border-b border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">From</p>
            <p className="text-sm font-semibold text-gray-900">{supplierName}</p>
            {data.tradie.abn_number && (
              <p className="text-sm text-gray-600">ABN: {data.tradie.abn_number}</p>
            )}
            {supplierLocation && <p className="text-sm text-gray-600">{supplierLocation}</p>}
            <p className="text-sm text-gray-600">{data.tradie.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Billed to</p>
            <p className="text-sm font-semibold text-gray-900">{data.client.full_name}</p>
            <p className="text-sm text-gray-600">{data.client.email}</p>
            {data.job.location_address && (
              <p className="text-sm text-gray-600 mt-1">Service address: {data.job.location_address}</p>
            )}
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
              <tr>
                <td className="py-3">
                  <p className="text-gray-900 capitalize">{jobLabel}</p>
                  {descClean && <p className="text-xs text-gray-500 mt-0.5">{descClean}</p>}
                </td>
                <td className="py-3 text-right text-gray-900">${baseDollars.toFixed(2)}</td>
              </tr>
              {processingDollars > 0 && (
                <tr>
                  <td className="py-3 text-gray-600">Secure processing fee</td>
                  <td className="py-3 text-right text-gray-900">${processingDollars.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="pt-3 text-gray-600">Subtotal (ex. GST)</td>
                <td className="pt-3 text-right text-gray-900">${(baseDollars + processingDollars).toFixed(2)}</td>
              </tr>
              {data.tradie.is_gst_registered && (
                <tr>
                  <td className="pt-1.5 text-gray-600">GST (10%)</td>
                  <td className="pt-1.5 text-right text-gray-900">${gstDollars.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="pt-3 text-base font-bold text-gray-900">Total</td>
                <td className="pt-3 text-right text-base font-bold text-gray-900">${totalDollars.toFixed(2)} AUD</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer note */}
        <div className="pt-6 border-t border-gray-200 text-xs text-gray-400">
          <p>
            {data.tradie.is_gst_registered
              ? `GST amount shown separately as required by the ATO. ABN ${data.tradie.abn_number || 'N/A'}.`
              : 'Supplier is not registered for GST.'}
          </p>
          <p className="mt-1">Paid via ConnecTradie. Funds secured with Stripe.</p>
        </div>
      </div>
    </div>
  );
}
