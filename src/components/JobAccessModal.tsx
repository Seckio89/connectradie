import { useState } from 'react';
import { Briefcase, CheckCircle2, X, Loader2, Crown, CreditCard } from 'lucide-react';
import { createPaymentSession } from '../lib/stripe';

interface JobAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => Promise<void>;
  jobDescription: string;
  jobId: string;
  isProUser?: boolean;
}

export default function JobAccessModal({ isOpen, onClose, onUnlock, jobDescription: _jobDescription, jobId, isProUser }: JobAccessModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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
        await createPaymentSession('job_access', jobId);
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
          <h3 className="text-xl font-bold text-gray-900">Access Job</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-blue-600" />
          </div>

          <h4 className="text-center text-lg font-semibold text-gray-900 mb-2">
            Unlock Job Access
          </h4>

          <p className="text-center text-gray-600 mb-6">
            To access this job and submit your quote, a small access fee is required.
          </p>

          <div className={`rounded-xl p-6 mb-6 border-2 ${isProUser ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-br from-blue-50 to-teal-50 border-blue-200'}`}>
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
                  <span className="font-medium text-gray-900">$2.99</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Secure Processing Fee (2%)</span>
                  <span className="font-medium text-gray-700">$0.06</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-blue-600">$3.05</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Submit Your Quote</p>
                <p className="text-sm text-gray-600">Provide pricing for this job</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Direct Client Contact</p>
                <p className="text-sm text-gray-600">Message the client about details</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Project Management</p>
                <p className="text-sm text-gray-600">Track progress in your dashboard</p>
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-teal-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-90 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                'Unlock Job'
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
