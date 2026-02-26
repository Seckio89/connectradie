import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, ShieldAlert, ArrowRight, X } from 'lucide-react';

interface VerificationGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'unverified' | 'expired';
}

export default function VerificationGateModal({ isOpen, onClose, reason = 'unverified' }: VerificationGateModalProps) {
  const navigate = useNavigate();
  const isExpired = reason === 'expired';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isExpired ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            {isExpired ? (
              <ShieldAlert className="w-8 h-8 text-red-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            )}
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {isExpired ? 'License Expired' : 'Verification Required'}
          </h3>
          <p className="text-gray-600 mb-6">
            {isExpired
              ? 'Your trade license has expired. Please upload a renewed license to continue accepting jobs and submitting quotes.'
              : 'You must be verified to accept jobs and submit quotes. Complete your verification to unlock full platform access.'}
          </p>

          <div className={`border rounded-xl p-4 mb-6 ${
            isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-3 text-left">
              <Shield className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                isExpired ? 'text-red-600' : 'text-amber-600'
              }`} />
              <div>
                <p className={`text-sm font-medium ${isExpired ? 'text-red-900' : 'text-amber-900'}`}>
                  {isExpired ? 'What to do' : 'Why verification?'}
                </p>
                <p className={`text-sm mt-1 ${isExpired ? 'text-red-700' : 'text-amber-700'}`}>
                  {isExpired
                    ? 'Go to Settings and upload your renewed trade license. Once verified, you can resume accepting jobs.'
                    : 'Verified tradies earn trust badges, appear higher in search, and get access to urgent leads.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Not Now
            </button>
            <button
              onClick={() => {
                onClose();
                navigate('/settings', { state: { tab: 'verification' } });
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white font-medium rounded-xl transition-colors ${
                isExpired ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isExpired ? 'Upload License' : 'Go to Settings'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
