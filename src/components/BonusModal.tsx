import { useEffect, useState } from 'react';
import { X, Loader2, Gift, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createBonusPayment } from '../lib/stripePayments';

interface BonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  tradieName?: string | null;
  jobLabel?: string | null;
}

const PRESET_AMOUNTS = [10, 20, 50, 100];

export default function BonusModal({ isOpen, onClose, jobId, tradieName, jobLabel }: BonusModalProps) {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  const [tradieIsGstRegistered, setTradieIsGstRegistered] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoadingPayment(true);
    setFetchError(null);
    setAmountInput('');
    setSubmitError(null);

    (async () => {
      // Extra payments are only for one-off jobs — block if this job belongs to a recurring service.
      // Check both the recurring_jobs.original_job_id link and the jobs.recurring_job_id back-link.
      const [{ data: recurringLink }, { data: jobRow }] = await Promise.all([
        supabase
          .from('recurring_jobs')
          .select('id')
          .eq('original_job_id', jobId)
          .maybeSingle(),
        supabase
          .from('jobs')
          .select('recurring_job_id')
          .eq('id', jobId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (recurringLink || jobRow?.recurring_job_id) {
        setFetchError("Extra payments are only available for one-off jobs. For ongoing services, adjust the rate in the service settings.");
        setLoadingPayment(false);
        return;
      }

      const { data: paymentRow, error: payErr } = await supabase
        .from('payments')
        .select('id, amount, tradie_id, metadata, status, payment_type')
        .eq('job_id', jobId)
        .eq('payment_type', 'job_funding')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (payErr || !paymentRow) {
        setFetchError("We couldn't find the original payment for this job.");
        setLoadingPayment(false);
        return;
      }

      const meta = (paymentRow.metadata || {}) as Record<string, unknown>;
      if (!meta.transfer_id) {
        setFetchError("The original payment hasn't been released yet. Bonuses are only available after release.");
        setLoadingPayment(false);
        return;
      }

      setPaymentId(paymentRow.id);
      setOriginalAmount(paymentRow.amount);

      if (paymentRow.tradie_id) {
        const { data: tradie } = await supabase
          .from('profiles')
          .select('is_gst_registered')
          .eq('id', paymentRow.tradie_id)
          .maybeSingle();
        if (!cancelled) {
          setTradieIsGstRegistered(tradie?.is_gst_registered === true);
        }
      }

      if (!cancelled) setLoadingPayment(false);
    })();

    return () => { cancelled = true; };
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const amount = parseFloat(amountInput);
  const validAmount = !isNaN(amount) && amount >= 1;
  const gst = tradieIsGstRegistered && validAmount ? amount * 0.1 : 0;
  const processingFee = validAmount ? amount * 0.0295 + 0.30 : 0;
  const totalCharge = validAmount ? amount + gst + processingFee : 0;

  const capDollars = originalAmount ? (originalAmount * 2) / 100 : null;
  const exceedsCap = capDollars != null && validAmount && amount > capDollars;

  const canSubmit = !!paymentId && validAmount && !exceedsCap && !submitting;

  const handleSubmit = async () => {
    if (!paymentId || !validAmount) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { url } = await createBonusPayment(paymentId, amount, jobId);
      window.location.href = url;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start checkout.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center">
              <Gift className="w-5 h-5 text-warm-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Give an extra payment</h2>
              <p className="text-xs text-gray-500">
                {tradieName ? `For ${tradieName}` : 'For your tradie'}
                {jobLabel ? ` · ${jobLabel}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loadingPayment ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{fetchError}</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick amounts</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmountInput(String(v))}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors border ${
                        amountInput === String(v)
                          ? 'bg-warm-500 text-white border-warm-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-warm-300 hover:bg-warm-50'
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Custom amount {tradieIsGstRegistered && <span className="normal-case text-gray-400 font-normal">(ex. GST)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Enter an extra amount"
                    className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-warm-400 bg-white"
                  />
                </div>
                {capDollars != null && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Max ${capDollars.toFixed(2)} (2× the original payment).
                  </p>
                )}
              </div>

              {validAmount && !exceedsCap && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Extra payment</span>
                    <span>${amount.toFixed(2)}</span>
                  </div>
                  {tradieIsGstRegistered && (
                    <div className="flex justify-between text-gray-600">
                      <span>GST (10%)</span>
                      <span>${gst.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Processing fee</span>
                    <span>${processingFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-1.5 mt-1.5 flex justify-between font-semibold text-gray-900">
                    <span>You'll be charged</span>
                    <span>${totalCharge.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {exceedsCap && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    Extra payments are capped at ${capDollars!.toFixed(2)} for this job. Please lower the amount.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-gray-500">
                <Shield className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span>Funds are sent directly to your tradie via Stripe — no escrow hold.</span>
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Send extra payment
          </button>
        </div>
      </div>
    </div>
  );
}
