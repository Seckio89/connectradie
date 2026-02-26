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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl transform transition-all">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Unlock Lead Details</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>

          <h4 className="text-center text-lg font-semibold text-gray-900 mb-2">
            Connect with {clientName}
          </h4>

          <p className="text-center text-gray-600 mb-6">
            To unlock this lead and view full contact details, a one-time connection fee is required.
          </p>

          {isProUser && remainingUnlocks !== null && remainingUnlocks !== undefined && totalUnlocks && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800 font-medium">Free with Pro</span>
              </div>
              <span className="text-sm font-bold text-green-700">Unlimited</span>
            </div>
          )}

          {!isProUser && remainingUnlocks !== null && remainingUnlocks !== undefined && totalUnlocks && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-amber-800 font-medium">Free unlocks remaining</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${((totalUnlocks - remainingUnlocks) / totalUnlocks) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-amber-700">{remainingUnlocks}/{totalUnlocks}</span>
              </div>
            </div>
          )}

          <div className={`rounded-xl p-6 mb-6 border-2 ${isProUser ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-primary-50 to-amber-50 border-primary-200'}`}>
            {isProUser ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Crown className="w-6 h-6 text-green-600" />
                  <span className="text-3xl font-bold text-green-600">FREE</span>
                </div>
                <p className="text-center text-sm text-gray-700 font-medium">Included with Pro plan</p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">$15.00</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Secure Processing Fee (2%)</span>
                  <span className="font-medium text-gray-700">$0.30</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-primary-600">$15.30</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">View Full Contact Details</p>
                <p className="text-sm text-gray-600">Access phone number and email address</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Unlimited Messaging</p>
                <p className="text-sm text-gray-600">Chat without restrictions</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">View Job Details</p>
                <p className="text-sm text-gray-600">See full booking request and requirements</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleUnlock}
              disabled={loading || success}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-amber-600 text-white font-semibold rounded-xl hover:from-primary-700 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                'Unlock Details'
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
