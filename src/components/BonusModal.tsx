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
        .select('id, amount, metadata, status, payment_type')
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

      // `payments` has no tradie_id column — the charge functions stamp it into
      // metadata. Selecting it made PostgREST reject the whole query, which is
      // why every bonus attempt reported "couldn't find the original payment".
      const metaTradieId = typeof meta.tradie_id === 'string' ? meta.tradie_id : null;
      if (metaTradieId) {
        const { data: tradie } = await supabase
          .from('profiles')
          .select('is_gst_registered')
          .eq('id', metaTradieId)
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
        className="bg-ct-surface rounded-ct-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-ct-line-soft">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-ct-md bg-ct-amber/[0.13] flex items-center justify-center">
              <Gift className="w-5 h-5 text-ct-amber" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ct-paper">Give an extra payment</h2>
              <p className="text-xs text-ct-mute">
                {tradieName ? `For ${tradieName}` : 'For your tradie'}
                {jobLabel ? ` · ${jobLabel}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loadingPayment ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-ct-mute animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ct-rose">{fetchError}</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">Quick amounts</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmountInput(String(v))}
                      className={`py-2 rounded-ct-sm text-sm font-semibold transition-colors border ${
                        amountInput === String(v)
                          ? 'bg-ct-teal text-ct-ink border-ct-teal'
                          : 'bg-ct-surface text-ct-mute-2 border-ct-line hover:border-ct-teal/30 hover:bg-ct-amber/[0.13]'
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">
                  Custom amount {tradieIsGstRegistered && <span className="normal-case text-ct-mute font-normal">(ex. GST)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ct-mute text-sm font-medium">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Enter an extra amount"
                    className="w-full pl-7 pr-3 py-2.5 border border-ct-line rounded-ct-sm text-sm text-ct-paper focus:outline-none focus:ring-2 focus:ring-ct-teal bg-ct-surface"
                  />
                </div>
                {capDollars != null && (
                  <p className="text-[0.6875rem] text-ct-mute mt-1">
                    Max ${capDollars.toFixed(2)} (2× the original payment).
                  </p>
                )}
              </div>

              {validAmount && !exceedsCap && (
                <div className="bg-ct-surface-2 border border-ct-line rounded-ct-sm p-3 text-xs space-y-1">
                  <div className="flex justify-between text-ct-mute-2">
                    <span>Extra payment</span>
                    <span>${amount.toFixed(2)}</span>
                  </div>
                  {tradieIsGstRegistered && (
                    <div className="flex justify-between text-ct-mute-2">
                      <span>GST (10%)</span>
                      <span>${gst.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-ct-mute-2">
                    <span>Processing fee</span>
                    <span>${processingFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-ct-line pt-1.5 mt-1.5 flex justify-between font-semibold text-ct-paper">
                    <span>You'll be charged</span>
                    <span>${totalCharge.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {exceedsCap && (
                <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-ct-amber">
                    Extra payments are capped at ${capDollars!.toFixed(2)} for this job. Please lower the amount.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-ct-mute">
                <Shield className="w-3.5 h-3.5 text-ct-mute flex-shrink-0 mt-0.5" />
                <span>Funds are sent directly to your tradie via Stripe — nothing is held first.</span>
              </div>

              {submitError && (
                <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-ct-rose">{submitError}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-ct-line-soft">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-ct-surface border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Send extra payment
          </button>
        </div>
      </div>
    </div>
  );
}
