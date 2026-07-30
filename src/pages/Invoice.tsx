import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

type InvoiceData = {
  id: string;
  amount: number; // cents, ex-GST
  processing_fee: number; // cents
  created_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  invoice_number: number | null;
  invoice_ref: string | null;
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
  const navigate = useNavigate();
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
          .select('id, amount, processing_fee, created_at, status, metadata, job_id, profile_id, invoice_number, invoice_ref')
          .eq('id', paymentId)
          .maybeSingle();
        if (payErr) throw payErr;
        if (!payment) throw new Error('Invoice not found');
        if (!payment.job_id) throw new Error('Invoice not found');

        const [jobRes, clientRes] = await Promise.all([
          supabase.from('jobs').select('id, title, description, location_address, tradie_id').eq('id', payment.job_id).maybeSingle(),
          supabase.from('profiles').select('full_name, email').eq('id', payment.profile_id).maybeSingle(),
        ]);

        if (cancelled) return;
        if (!jobRes.data) throw new Error('Job not found');
        if (!clientRes.data) throw new Error('Client not found');

        // `payments` has no tradie_id column. The charge functions stamp it into
        // metadata (see accept-and-pay), and the job carries it too — prefer the
        // frozen metadata value, fall back to the job for older rows.
        const meta = (payment.metadata ?? {}) as Record<string, unknown>;
        const metaTradieId = typeof meta.tradie_id === 'string' ? meta.tradie_id : null;
        const tradieId = metaTradieId ?? jobRes.data.tradie_id;
        if (!tradieId) throw new Error('Tradie not found');

        const tradieRes = await supabase
          .from('profiles')
          .select('full_name, email, abn_number, abn_entity_name, is_gst_registered, address, suburb')
          .eq('id', tradieId)
          .maybeSingle();

        if (cancelled) return;
        if (!tradieRes.data) throw new Error('Tradie not found');

        setData({
          id: payment.id,
          amount: payment.amount,
          processing_fee: payment.processing_fee || 0,
          created_at: payment.created_at,
          status: payment.status,
          metadata: meta,
          invoice_number: payment.invoice_number,
          invoice_ref: payment.invoice_ref,
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
      <div className="min-h-screen flex items-center justify-center bg-ct-surface sm:bg-ct-surface-2">
        <Loader2 className="w-6 h-6 text-ct-mute animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col bg-ct-surface sm:bg-ct-surface-2 p-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2 rounded-ct-sm text-sm font-medium transition-colors min-h-[44px] self-start mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-ct-rose mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-ct-paper mb-1">Can't load invoice</h1>
            <p className="text-sm text-ct-mute-2">{error || 'Invoice data is missing.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const baseDollars = data.amount / 100;
  const gstDollars = data.tradie.is_gst_registered ? baseDollars * 0.1 : 0;
  const processingDollars = data.processing_fee / 100;
  const totalDollars = baseDollars + gstDollars + processingDollars;

  const invoiceNumber = data.invoice_ref
    || (data.invoice_number != null
      ? `INV-${String(data.invoice_number).padStart(4, '0')}`
      : `INV-${data.id.slice(0, 8).toUpperCase()}`);
  const issueDate = new Date(data.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const category = data.job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
  const descClean = data.job.description.replace(/^\[[^\]]+\]\s*/, '');
  const jobLabel = data.job.title || category || 'Services rendered';

  // Both conditions are required for the document to legally BE a tax invoice:
  // GST registration, and an ABN to print on it.
  const isValidTaxInvoice = Boolean(data.tradie.is_gst_registered && data.tradie.abn_number);
  const supplierName = data.tradie.abn_entity_name || data.tradie.full_name;
  const supplierLocation = [data.tradie.address, data.tradie.suburb].filter(Boolean).join(', ');

  return (
    <div className="invoice-page min-h-screen bg-ct-surface sm:bg-ct-surface-2 py-6 sm:py-8 px-4 print:py-0 print:px-0 print:bg-ct-surface" style={{ backgroundColor: 'white', color: 'black' }}>
      {/* Navigation and actions — hidden when printing */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2 rounded-ct-sm text-sm font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ct-surface text-ct-ink rounded-ct-sm text-sm font-medium hover:bg-ct-surface transition-colors min-h-[44px]"
        >
          <Printer className="w-4 h-4" />
          Download / Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-ct-surface border border-ct-line rounded-ct-lg p-8 sm:p-12 print:border-0 print:rounded-none print:p-6 print:max-w-none print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-ct-line">
          <div>
            {/* An AU tax invoice for a supply over $82.50 MUST show the
                supplier's ABN. This was driven by is_gst_registered alone while
                the ABN line below is conditional, so a GST-registered tradie
                with no ABN on file produced a document headed "Tax Invoice"
                that showed "ABN N/A" — not a valid tax invoice. Fall back to
                plain "Invoice" rather than issue an invalid one. */}
            <h1 className="text-2xl font-bold text-ct-paper">
              {isValidTaxInvoice ? 'Tax Invoice' : 'Invoice'}
            </h1>
            <p className="text-sm text-ct-mute mt-1">{invoiceNumber}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-ct-mute">Issued</p>
            <p className="text-ct-paper font-medium">{issueDate}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-6 border-b border-ct-line">
          <div>
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">From</p>
            <p className="text-sm font-semibold text-ct-paper">{supplierName}</p>
            {data.tradie.abn_number && (
              <p className="text-sm text-ct-mute-2">ABN: {data.tradie.abn_number}</p>
            )}
            {supplierLocation && <p className="text-sm text-ct-mute-2">{supplierLocation}</p>}
            <p className="text-sm text-ct-mute-2">{data.tradie.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">Billed to</p>
            <p className="text-sm font-semibold text-ct-paper">{data.client.full_name}</p>
            <p className="text-sm text-ct-mute-2">{data.client.email}</p>
            {data.job.location_address && (
              <p className="text-sm text-ct-mute-2 mt-1">Service address: {data.job.location_address}</p>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ct-line">
                <th className="text-left pb-2 font-semibold text-ct-mute uppercase tracking-wide text-xs">Description</th>
                <th className="text-right pb-2 font-semibold text-ct-mute uppercase tracking-wide text-xs">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ct-line-soft">
              <tr>
                <td className="py-3">
                  <p className="text-ct-paper capitalize">{jobLabel}</p>
                  {descClean && <p className="text-xs text-ct-mute mt-0.5">{descClean}</p>}
                </td>
                <td className="py-3 text-right text-ct-paper">${baseDollars.toFixed(2)}</td>
              </tr>
              {processingDollars > 0 && (
                <tr>
                  <td className="py-3 text-ct-mute-2">Secure processing fee</td>
                  <td className="py-3 text-right text-ct-paper">${processingDollars.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-ct-line">
                <td className="pt-3 text-ct-mute-2">Subtotal (ex. GST)</td>
                <td className="pt-3 text-right text-ct-paper">${(baseDollars + processingDollars).toFixed(2)}</td>
              </tr>
              {data.tradie.is_gst_registered && (
                <tr>
                  <td className="pt-1.5 text-ct-mute-2">GST (10%)</td>
                  <td className="pt-1.5 text-right text-ct-paper">${gstDollars.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="pt-3 text-base font-bold text-ct-paper">Total</td>
                <td className="pt-3 text-right text-base font-bold text-ct-paper">${totalDollars.toFixed(2)} AUD</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer note */}
        <div className="pt-6 border-t border-ct-line text-xs text-ct-mute">
          <p>
            {isValidTaxInvoice
              ? `GST amount shown separately as required by the ATO. ABN ${data.tradie.abn_number}.`
              : data.tradie.is_gst_registered
              ? 'Supplier is registered for GST but has no ABN on file, so this is not a valid tax invoice.'
              : 'Supplier is not registered for GST.'}
          </p>
          <p className="mt-1">Paid via ConnecTradie. Funds secured with Stripe.</p>
        </div>
      </div>
    </div>
  );
}
