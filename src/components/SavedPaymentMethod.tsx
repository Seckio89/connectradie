import { useState } from 'react';
import { Building2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface SavedPaymentMethodProps {
  bsbLast4: string | null;
  accountLast4: string | null;
  mandateStatus: string;
  onRemove: () => Promise<void>;
}

export default function SavedPaymentMethod({ bsbLast4, accountLast4, mandateStatus, onRemove }: SavedPaymentMethodProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-secondary-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-secondary-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  BSB ****{bsbLast4 || '??'} · Account ****{accountLast4 || '????'}
                </p>
                {mandateStatus === 'active' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
              <p className="text-xs text-gray-500">
                {mandateStatus === 'active'
                  ? 'Active — invoices are charged automatically'
                  : mandateStatus === 'revoked'
                  ? 'Revoked — please set up a new account'
                  : 'Failed — please set up a new account'}
              </p>
            </div>
          </div>
        </div>
        {mandateStatus === 'active' && (
          <div className="px-4 py-2.5 bg-white border-t border-secondary-100">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={removing}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Stop Automatic Payments
            </button>
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Stop Automatic Payments?"
          message="Your bank account will be removed and automatic invoice payments will stop. You'll need to pay future invoices manually by card."
          confirmText={removing ? 'Stopping...' : 'Stop Auto-Pay'}
          onConfirm={handleRemove}
          onCancel={() => setShowConfirm(false)}
          type="danger"
        />
      )}
    </>
  );
}
