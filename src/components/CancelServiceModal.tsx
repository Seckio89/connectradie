import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { CancellationCategory } from '../lib/recurringJobs';

interface CancelServiceModalProps {
  isOpen: boolean;
  serviceLabel: string;
  otherPartyRole: 'client' | 'tradie';
  onCancel: () => void;
  onConfirm: (payload: { category?: CancellationCategory; reason?: string }) => void | Promise<void>;
}

interface Chip {
  value: CancellationCategory;
  label: string;
  forRole: 'client' | 'tradie' | 'both';
}

const CHIPS: Chip[] = [
  { value: 'price', label: 'Too expensive', forRole: 'both' },
  { value: 'not_needed', label: "Don't need it anymore", forRole: 'both' },
  { value: 'changed_tradie', label: 'Changed tradies', forRole: 'client' },
  { value: 'quality', label: 'Quality issue', forRole: 'both' },
  { value: 'frequency', label: 'Wrong frequency', forRole: 'both' },
  { value: 'other', label: 'Other', forRole: 'both' },
];

export default function CancelServiceModal({
  isOpen,
  serviceLabel,
  otherPartyRole,
  onCancel,
  onConfirm,
}: CancelServiceModalProps) {
  const [category, setCategory] = useState<CancellationCategory | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCategory(undefined);
      setReason('');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const visibleChips = CHIPS.filter((c) => c.forRole === 'both' || c.forRole === otherPartyRole);
  const otherPartyLabel = otherPartyRole === 'tradie' ? 'your tradie' : 'your client';

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ category, reason: reason.trim() || undefined });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full shadow-xl">
        <div className="flex items-start justify-between p-6 pb-2">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-red-50 rounded-full flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="pt-0.5">
              <h3 className="text-lg font-semibold text-gray-900">End {serviceLabel}?</h3>
              <p className="text-sm text-gray-600 mt-1">
                This will stop future sessions and end the agreement with {otherPartyLabel}.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Why are you ending this? <span className="lowercase text-gray-400 normal-case font-normal">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((chip) => {
              const selected = category === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setCategory(selected ? undefined : chip.value)}
                  className={
                    selected
                      ? 'px-3 py-1.5 rounded-full text-xs font-medium border bg-secondary-50 text-secondary-700 border-secondary-300'
                      : 'px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pt-3 pb-4">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
            Anything else <span className="lowercase text-gray-400 normal-case font-normal">(optional)</span>
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={otherPartyRole === 'tradie' ? 'Helps your tradie understand the decision' : 'Helps your client understand the decision'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-secondary-500 focus:ring-1 focus:ring-secondary-500 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">{reason.length}/500</p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Keep service
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? 'Ending…' : 'End service'}
          </button>
        </div>
      </div>
    </div>
  );
}
