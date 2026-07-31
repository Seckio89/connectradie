import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning'
}: ConfirmModalProps) {
  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          bg: 'bg-ct-rose/[0.13]',
          icon: 'text-ct-rose',
          button: 'bg-ct-rose hover:brightness-110'
        };
      case 'warning':
        return {
          bg: 'bg-ct-amber/[0.13]',
          icon: 'text-ct-amber',
          button: 'bg-ct-teal hover:bg-ct-teal'
        };
      case 'info':
        return {
          bg: 'bg-ct-surface-2',
          icon: 'text-ct-mute-2',
          button: 'bg-ct-teal hover:brightness-110'
        };
    }
  };

  const colors = getColors();

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4 animate-fade-in modal-sheet-overlay" onClick={onCancel}>
      <div className="bg-ct-surface rounded-t-2xl sm:rounded-ct-lg max-w-md w-full shadow-2xl animate-scale-in modal-sheet pb-[env(safe-area-inset-bottom)] sm:pb-0" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 ${colors.bg} rounded-full flex-shrink-0`}>
              <AlertTriangle className={`w-6 h-6 ${colors.icon}`} />
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-semibold text-ct-paper mb-2">
                {title}
              </h3>
              <p className="text-ct-mute-2 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 flex gap-3" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-ct-surface-2 text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-line transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 ${colors.button} text-ct-paper rounded-ct-md font-medium transition-colors shadow-sm`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
