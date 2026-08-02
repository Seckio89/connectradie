import { useState } from 'react';
import { X, Check, Calendar } from 'lucide-react';
import { logVisit } from '../lib/ongoingServices';
import type { ServiceAgreement, ServiceVisitType } from '../types/database';

interface LogVisitModalProps {
  isOpen: boolean;
  agreement: ServiceAgreement & { client?: { full_name: string } };
  onClose: () => void;
  onSuccess: () => void;
}

export default function LogVisitModal({ isOpen, agreement, onClose, onSuccess }: LogVisitModalProps) {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitType, setVisitType] = useState<ServiceVisitType>('regular');
  const [amount, setAmount] = useState(agreement.rate_per_visit);
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await logVisit(agreement.id, {
        visit_date: visitDate,
        visit_type: visitType,
        amount,
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to log visit:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const gst = Math.round(amount * 0.1 * 100) / 100;
  const total = amount + gst;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-ct-surface rounded-ct-lg shadow-2xl z-50 w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-ct-paper">Log extra visit</h2>
          <button onClick={onClose} className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Client & Service */}
        <div className="mb-5 p-3 bg-ct-surface-2 rounded-ct-sm">
          <p className="text-sm font-medium text-ct-paper">{agreement.title}</p>
          <p className="text-xs text-ct-mute">{agreement.client?.full_name || 'Client'}</p>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-ct-mute-2 mb-1">Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute pointer-events-none" />
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
            />
          </div>
        </div>

        {/* Visit Type */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-ct-mute-2 mb-1.5">Type</label>
          <div className="flex gap-2">
            {([
              { value: 'regular' as const, label: 'Same rate' },
              { value: 'extra' as const, label: 'Custom rate' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setVisitType(opt.value);
                  if (opt.value === 'extra') {
                    setUseCustomAmount(true);
                  } else {
                    setUseCustomAmount(false);
                    setAmount(agreement.rate_per_visit);
                  }
                }}
                className={`flex-1 py-2 px-4 rounded-ct-sm border text-sm font-medium transition-colors ${
                  visitType === opt.value
                    ? 'border-ct-teal bg-ct-teal/[0.14] text-ct-teal'
                    : 'border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ct-mute">
            {visitType === 'regular'
              ? `Charged at the agreed rate of $${agreement.rate_per_visit.toFixed(2)}`
              : 'Set a custom amount for this visit'}
          </p>
        </div>

        {/* Amount */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-ct-mute-2 mb-1.5">Amount</label>
          {!useCustomAmount ? (
            <div className="flex items-center justify-between p-3 bg-ct-surface-2 rounded-ct-sm">
              <span className="text-sm text-ct-paper font-medium">${agreement.rate_per_visit.toFixed(2)}</span>
              <button
                onClick={() => setUseCustomAmount(true)}
                className="text-xs text-ct-teal hover:text-ct-teal font-medium"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ct-mute text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              />
            </div>
          )}
        </div>

        {/* Purpose */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-ct-mute-2 mb-1">
            Purpose for extra visit
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Emergency callout, extra deep clean, client request"
            className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
          />
        </div>

        {/* Total */}
        <div className="mb-5 p-3 bg-ct-teal/[0.14] rounded-ct-sm">
          <div className="flex justify-between text-xs text-ct-mute-2 mb-1">
            <span>Amount</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-ct-mute-2 mb-2">
            <span>GST (10%)</span>
            <span>${gst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-ct-paper pt-2 border-t border-ct-teal/30">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || amount <= 0 || !notes.trim()}
            className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Logging...' : 'Log extra visit'}
          </button>
        </div>
      </div>
    </>
  );
}
