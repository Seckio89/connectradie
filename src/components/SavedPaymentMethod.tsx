import { useState } from 'react';
import { Building2, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
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
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary-50 border border-secondary-200 rounded-lg">
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
        <button
          onClick={() => setShowConfirm(true)}
          disabled={removing}
          className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
          title="Remove saved bank account"
        >
          {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Remove Direct Debit?"
          message="Your bank account will be removed. Future invoices will require manual card payment."
          confirmText={removing ? 'Removing...' : 'Remove'}
          onConfirm={handleRemove}
          onCancel={() => setShowConfirm(false)}
          type="danger"
        />
      )}
    </>
  );
}
