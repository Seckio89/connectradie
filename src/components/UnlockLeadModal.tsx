import { useState, useEffect } from 'react';
import { Lock, CheckCircle2, X, Loader2, Crown, CreditCard } from 'lucide-react';
import { createPaymentSession } from '../lib/stripe';

interface UnlockLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => Promise<void>;
  clientName: string;
  jobId: string;
  isProUser?: boolean;
  remainingUnlocks?: number | null;
  totalUnlocks?: number;
}

export default function UnlockLeadModal({ isOpen, onClose, onUnlock, clientName, jobId, isProUser, remainingUnlocks, totalUnlocks }: UnlockLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLoading(false);
      setSuccess(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUnlock = async () => {
    setLoading(true);
    setError('');

    try {
      if (isProUser) {
        await onUnlock();
        setSuccess(true);
        setTimeout(() => {
          setLoading(false);
          setSuccess(false);
          onClose();
        }, 1500);
      } else {
        await createPaymentSession('lead_unlock', jobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
      setSuccess(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 modal-sheet-overlay">
      <div className="bg-ct-surface rounded-t-2xl sm:rounded-ct-lg max-w-md w-full shadow-2xl transform transition-all modal-sheet pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="p-6 border-b border-ct-line flex items-center justify-between">
          <h3 className="text-xl font-bold text-ct-paper">Unlock lead details</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
          >
            <X className="w-5 h-5 text-ct-mute" />
          </button>
        </div>

        <div className="p-6">
          <div className="w-16 h-16 bg-ct-amber/[0.13] rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-ct-amber" />
          </div>

          <h4 className="text-center text-lg font-semibold text-ct-paper mb-2">
            Connect with {clientName}
          </h4>

          <p className="text-center text-ct-mute-2 mb-6">
            To unlock this lead and view full contact details, a one-time connection fee is required.
          </p>

          {isProUser && remainingUnlocks !== null && remainingUnlocks !== undefined && totalUnlocks && (
            <div className="bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-ct-teal" />
                <span className="text-sm text-ct-teal font-medium">Free with Pro</span>
              </div>
              <span className="text-sm font-bold text-ct-teal">Unlimited</span>
            </div>
          )}

          {!isProUser && remainingUnlocks !== null && remainingUnlocks !== undefined && totalUnlocks && (
            <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-ct-amber" />
                <span className="text-sm text-ct-paper font-medium">Free unlocks remaining</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-ct-teal/[0.14] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ct-teal rounded-full transition-all"
                    style={{ width: `${((totalUnlocks - remainingUnlocks) / totalUnlocks) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-ct-amber">{remainingUnlocks}/{totalUnlocks}</span>
              </div>
            </div>
          )}

          <div className={`rounded-ct-md p-6 mb-6 border-2 ${isProUser ? 'bg-ct-teal/[0.14] border-ct-teal/30' : 'bg-ct-surface-2 border-ct-line'}`}>
            {isProUser ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Crown className="w-6 h-6 text-ct-teal" />
                  <span className="text-3xl font-bold text-ct-teal">Free</span>
                </div>
                <p className="text-center text-sm text-ct-mute-2 font-medium">Included with Pro plan</p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ct-mute-2">Subtotal</span>
                  <span className="font-medium text-ct-paper">$15.00</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ct-mute">Secure Processing Fee (2%)</span>
                  <span className="font-medium text-ct-mute-2">$0.30</span>
                </div>
                <div className="border-t border-ct-line pt-2 flex items-center justify-between">
                  <span className="font-semibold text-ct-paper">Total</span>
                  <span className="text-xl font-bold text-ct-mute-2">$15.30</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-ct-paper">View full contact details</p>
                <p className="text-sm text-ct-mute-2">Access phone number and email address</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-ct-paper">Unlimited messaging</p>
                <p className="text-sm text-ct-mute-2">Chat without restrictions</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-ct-paper">View job details</p>
                <p className="text-sm text-ct-mute-2">See full booking request and requirements</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md text-sm text-ct-rose">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border-2 border-ct-line text-ct-mute-2 font-semibold rounded-ct-md hover:bg-ct-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleUnlock}
              disabled={loading || success}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-ct-teal to-ct-teal text-ct-ink font-semibold rounded-ct-md hover:from-ct-teal hover:to-ct-teal transition-all shadow-lg hover:shadow-xl disabled:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isProUser ? 'Unlocking...' : 'Redirecting...'}
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Unlocked!
                </>
              ) : isProUser ? (
                'Unlock details'
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Pay & Unlock
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
