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
      <div className="relative bg-ct-surface rounded-ct-lg shadow-xl max-w-md w-full overflow-hidden max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-ct-mute hover:text-ct-mute-2 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isExpired ? 'bg-ct-rose/[0.13]' : 'bg-ct-amber/[0.13]'
          }`}>
            {isExpired ? (
              <ShieldAlert className="w-8 h-8 text-ct-rose" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-ct-amber" />
            )}
          </div>

          <h3 className="text-xl font-bold text-ct-paper mb-2">
            {isExpired ? 'License Expired' : 'Verification Required'}
          </h3>
          <p className="text-ct-mute-2 mb-6">
            {isExpired
              ? 'Your trade license has expired. Please upload a renewed license to continue accepting jobs and submitting quotes.'
              : 'You must be verified to accept jobs and submit quotes. Complete your verification to unlock full platform access.'}
          </p>

          <div className={`border rounded-ct-md p-4 mb-6 ${
            isExpired ? 'bg-ct-rose/[0.13] border-ct-rose/[0.34]' : 'bg-ct-surface-2 border-ct-line'
          }`}>
            <div className="flex items-start gap-3 text-left">
              <Shield className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                isExpired ? 'text-ct-rose' : 'text-ct-mute-2'
              }`} />
              <div>
                <p className={`text-sm font-medium ${isExpired ? 'text-ct-paper' : 'text-ct-paper'}`}>
                  {isExpired ? 'What to do' : 'How to get verified'}
                </p>
                <p className={`text-sm mt-1 ${isExpired ? 'text-ct-rose' : 'text-ct-mute-2'}`}>
                  {isExpired
                    ? 'Go to Settings \u2192 Verification tab and upload your renewed trade license. Once verified, you can resume accepting jobs.'
                    : 'Go to Settings \u2192 Verification tab. Add your ABN and license number, then submit for review. Once approved you\'ll earn a trust badge, appear higher in search, and get access to urgent leads.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 font-medium rounded-ct-md hover:bg-ct-surface-2 transition-colors"
            >
              Not Now
            </button>
            <button
              onClick={() => {
                onClose();
                navigate('/settings', { state: { tab: 'verification' } });
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-ct-paper font-medium rounded-ct-md transition-colors ${
                isExpired ? 'bg-ct-rose hover:brightness-110' : 'bg-ct-teal hover:brightness-110'
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
