import { X } from 'lucide-react';
import Modal from './Modal';
import { canPrintDocument } from '../lib/printableDocument';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Shown in the header — e.g. "Payment statement". Sentence case. */
  title: string;
  /** A complete HTML document. Rendered in a sandboxed iframe, so it keeps its own styling. */
  html: string;
}

/**
 * Shows a generated invoice/statement document in-app.
 *
 * Used when the print window is unavailable — inside the Capacitor app, which
 * has no print path, and on the web when pop-ups are blocked. The document is
 * a self-contained light-theme HTML string, so it renders in an iframe rather
 * than in the dark app chrome.
 */
export default function DocumentPreviewModal({ isOpen, onClose, title, html }: DocumentPreviewModalProps) {
  if (!isOpen) return null;

  const note = canPrintDocument()
    ? 'Your browser blocked the print window. Allow pop-ups for ConnecTradie to print or save a copy, or read it here.'
    : 'The app can’t print. Open ConnecTradie in a browser on any device to print or save a copy for your records.';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl">
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-ct-display text-lg font-semibold text-ct-paper">{title}</h2>
            <p className="text-sm text-ct-mute-2 mt-1">{note}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 -mt-1 rounded-ct-sm text-ct-mute hover:text-ct-paper hover:bg-ct-surface-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          className="w-full h-[55vh] min-h-[320px] bg-white border border-ct-line rounded-ct-lg"
        />

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="inline-flex px-5 py-2 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
