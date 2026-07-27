import { useEffect, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  closeOnBackdrop?: boolean;
}

export default function Modal({ isOpen, onClose, children, maxWidth = '2xl', closeOnBackdrop = true }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      {/* On mobile this is a bottom sheet (items-end + rounded-t-2xl), so
          pb-[env(safe-area-inset-bottom)] keeps the last row — usually the
          primary buttons — clear of the home indicator on notched phones. */}
      <div
        className={`bg-white rounded-t-2xl sm:rounded-2xl ${maxWidthClass} w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-xl pb-[env(safe-area-inset-bottom)] sm:pb-0`}
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </div>
  );
}
