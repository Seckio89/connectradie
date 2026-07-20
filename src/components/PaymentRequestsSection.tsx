// ─────────────────────────────────────────────────────────────────────────────
// PaymentRequestsSection — OFF-PLATFORM subcontractor payments (Payouts page).
//
// Worker side (active employee/subcontractor): "Request payment" from their
// employer — an invoice with the worker's BSB + account details, recorded on
// the platform and emailed to the business. Money moves outside the platform
// (bank transfer), by design: no Stripe split, no escrow.
//
// Employer side: lists requests billed to them (bank details revealed) with a
// "Mark as paid" action once they've transferred.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Plus, Loader2, CheckCircle2, Clock, X } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

interface PaymentRequestRow {
  id: string;
  created_by: string;
  billed_to_user_id: string | null;
  business_name: string;
  bill_to_name: string;
  invoice_number: string;
  notes: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid';
  payment_bsb: string | null;
  payment_account_number: string | null;
  payment_account_name: string | null;
  created_at: string;
}

const BSB_RE = /^\d{3}-?\d{3}$/;
const ACCOUNT_RE = /^\d{5,10}$/;

function money(n: number): string {
  return `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CHIP: Record<string, string> = {
  sent: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-gray-100 text-gray-600',
};

export default function PaymentRequestsSection() {
  const { user, profile, tradieDetails } = useAuth();
  const { showToast } = useToast();

  const isEmployedWorker = !!profile?.employer_id && profile?.employer_status === 'active';

  const [sentRequests, setSentRequests] = useState<PaymentRequestRow[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstIncluded, setGstIncluded] = useState(!!profile?.is_gst_registered);
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [sent, received] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('created_by', user.id)
          .not('billed_to_user_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('invoices')
          .select('*')
          .eq('billed_to_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      setSentRequests((sent.data as PaymentRequestRow[]) ?? []);
      setReceivedRequests((received.data as PaymentRequestRow[]) ?? []);
    } catch {
      // Non-fatal — section just shows empty.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Prefill bank details from the worker's most recent request.
  useEffect(() => {
    if (!showForm) return;
    const last = sentRequests[0];
    if (last?.payment_bsb && !bsb) setBsb(last.payment_bsb);
    if (last?.payment_account_number && !accountNumber) setAccountNumber(last.payment_account_number);
    if (last?.payment_account_name && !accountName) setAccountName(last.payment_account_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const handleSend = async () => {
    if (!user || !profile?.employer_id) return;
    const total = parseFloat(amount);
    if (!description.trim()) { setFormError('Describe what this payment is for.'); return; }
    if (!total || total <= 0) { setFormError('Enter a valid amount.'); return; }
    if (!BSB_RE.test(bsb.trim())) { setFormError('BSB should be 6 digits (e.g. 062-000).'); return; }
    if (!ACCOUNT_RE.test(accountNumber.trim())) { setFormError('Account number should be 5–10 digits.'); return; }
    if (!accountName.trim()) { setFormError('Enter the account name.'); return; }

    setSending(true);
    setFormError('');

    const gst = gstIncluded ? Math.round((total / 11) * 100) / 100 : 0;
    const subtotal = Math.round((total - gst) * 100) / 100;
    const invoiceNumber = `PR-${Date.now().toString(36).toUpperCase()}`;

    try {
      const { data: employer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', profile.employer_id)
        .maybeSingle();

      const { error: insertError } = await supabase.from('invoices').insert({
        created_by: user.id,
        billed_to_user_id: profile.employer_id,
        business_name: tradieDetails?.business_name || profile.full_name,
        business_abn: profile.abn_number || '',
        business_email: profile.email,
        invoice_number: invoiceNumber,
        bill_to_name: employer?.full_name || 'My employer',
        subtotal,
        gst_amount: gst,
        total_amount: total,
        notes: description.trim(),
        status: 'sent',
        payment_bsb: bsb.trim(),
        payment_account_number: accountNumber.trim(),
        payment_account_name: accountName.trim(),
      });
      if (insertError) throw insertError;

      // In-app notification to the employer.
      await supabase.rpc('create_notification', {
        p_user_id: profile.employer_id,
        p_title: 'Payment request received',
        p_message: `${profile.full_name} requested ${money(total)} — "${description.trim().slice(0, 80)}". Bank details are on the request in Payouts.`,
        p_type: 'payment',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/payouts',
        p_metadata: { invoice_number: invoiceNumber },
      });

      // Email the employer (address resolved server-side from their user id).
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            recipientUserId: profile.employer_id,
            subject: `Payment request from ${profile.full_name} — ${money(total)}`,
            body:
              `${profile.full_name} has requested a payment of ${money(total)}` +
              `${gstIncluded ? ` (incl. ${money(gst)} GST)` : ''} for: ${description.trim()}. ` +
              `Pay by bank transfer to ${accountName.trim()}, BSB ${bsb.trim()}, account ${accountNumber.trim()}, ` +
              `then mark it as paid in Payouts. Reference: ${invoiceNumber}.`,
            notificationType: 'INVOICE_RECEIVED',
            metadata: {
              amount: money(total),
              reference: invoiceNumber,
              link: 'https://connectradie.com/payouts',
            },
          },
        });
      } catch (emailErr) {
        console.warn('PaymentRequests: email send failed (request still recorded)', emailErr);
      }

      showToast('Payment request sent');
      setShowForm(false);
      setDescription('');
      setAmount('');
      fetchRequests();
    } catch (err) {
      console.error('PaymentRequests: send failed', err);
      setFormError('Could not send the request. Please try again.');
    }
    setSending(false);
  };

  const handleMarkPaid = async (row: PaymentRequestRow) => {
    setMarkingId(row.id);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;

      await supabase.rpc('create_notification', {
        p_user_id: row.created_by,
        p_title: 'Payment marked as paid',
        p_message: `Your payment request ${row.invoice_number} (${money(row.total_amount)}) was marked as paid.`,
        p_type: 'payment',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/payouts',
        p_metadata: { invoice_number: row.invoice_number },
      });

      showToast('Marked as paid');
      fetchRequests();
    } catch {
      showToast('Could not update the request', true);
    }
    setMarkingId(null);
  };

  // Render nothing while loading (no page-top spinner flash), and nothing at
  // all for solo tradies with no requests billed to them.
  if (loading) return null;
  if (!isEmployedWorker && receivedRequests.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-secondary-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Banknote className="w-5 h-5 text-secondary-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Payment requests</h2>
            <p className="text-xs text-gray-500">
              Paid outside the platform by bank transfer — recorded here for both sides.
            </p>
          </div>
        </div>
        {isEmployedWorker && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-warm-500 text-white text-xs font-semibold rounded-lg hover:bg-warm-600 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Request payment
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-xs">Loading…</span>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {/* Employer: requests to pay */}
          {receivedRequests.map((row) => (
            <div key={row.id} className="px-5 py-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{row.business_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CHIP[row.status]}`}>
                    {row.status === 'sent' ? 'Awaiting payment' : row.status === 'paid' ? 'Paid' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{row.notes}</p>
                {row.payment_bsb && (
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    {row.payment_account_name} · BSB {row.payment_bsb} · Acc {row.payment_account_number}
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {row.invoice_number} · {new Date(row.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-bold text-gray-900">{money(row.total_amount)}</span>
                {row.status === 'sent' && (
                  <button
                    onClick={() => handleMarkPaid(row)}
                    disabled={markingId === row.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {markingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Mark as paid
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Worker: requests they've sent */}
          {isEmployedWorker && sentRequests.map((row) => (
            <div key={row.id} className="px-5 py-3.5 flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{row.notes}</p>
                <p className="text-[11px] text-gray-400">
                  {row.invoice_number} · {new Date(row.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-900">{money(row.total_amount)}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${STATUS_CHIP[row.status]}`}>
                {row.status === 'sent' ? 'Awaiting payment' : row.status === 'paid' ? 'Paid' : 'Draft'}
              </span>
            </div>
          ))}

          {isEmployedWorker && sentRequests.length === 0 && receivedRequests.length === 0 && (
            <p className="px-5 py-6 text-center text-xs text-gray-400">
              No payment requests yet. Request payment from your employer for completed work.
            </p>
          )}
        </div>
      )}

      {/* Worker: request form */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} maxWidth="lg">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Request payment</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Sent to your employer with your bank details — they pay you directly by transfer.
              </p>
            </div>
            <button onClick={() => setShowForm(false)} aria-label="Close" className="p-2 -mr-1 -mt-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What's this for?</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Office cleans — week of 6 July (3 visits)"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (AUD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="450.00"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none sm:mt-9">
              <input
                type="checkbox"
                checked={gstIncluded}
                onChange={(e) => setGstIncluded(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700">Amount includes GST</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">BSB</label>
              <input
                type="text"
                value={bsb}
                onChange={(e) => setBsb(e.target.value)}
                placeholder="062-000"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account number</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="12345678"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account name</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="J Smith"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{formError}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 px-4 py-3 bg-warm-500 text-white rounded-xl font-medium hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              Send request
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
