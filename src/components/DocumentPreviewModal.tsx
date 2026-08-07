import { useState } from 'react';
import { Loader2, Share2, X } from 'lucide-react';
import Modal from './Modal';
import { canPrintDocument } from '../lib/printableDocument';
import { canShareDocument, shareDocumentAsPdf } from '../lib/shareDocument';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Shown in the header — e.g. "Payment statement". Sentence case. */
  title: string;
  /** A complete HTML document. Rendered in a sandboxed iframe, so it keeps its own styling. */
  html: string;
  /** Filename for the shared PDF, extension included — e.g. "Payment-statement-INV-1234.pdf". */
  filename: string;
}

/**
 * Shows a generated invoice/statement document in-app.
 *
 * Used when the print window is unavailable — inside the Capacitor app, which
 * has no print path, and on the web when pop-ups are blocked. The document is
 * a self-contained light-theme HTML string, so it renders in an iframe rather
 * than in the dark app chrome.
 *
 * On the app it also offers Share, which renders the same document to a PDF
 * and hands it to the system share sheet — the only route to Files, email or
 * a printer from a phone.
 */
export default function DocumentPreviewModal({ isOpen, onClose, title, html, filename }: DocumentPreviewModalProps) {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  if (!isOpen) return null;

  const shareable = canShareDocument();

  const note = canPrintDocument()
    ? 'Your browser blocked the print window. Allow pop-ups for ConnecTradie to print or save a copy, or read it here.'
    : shareable
      ? 'The app can’t print directly. Share it to save a PDF to Files, email it, or send it to a printer.'
      : 'The app can’t print. Open ConnecTradie in a browser on any device to print or save a copy for your records.';

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareDocumentAsPdf(html, filename, title);
    } catch {
      setShareError('The PDF couldn’t be created. Try again, or open ConnecTradie in a browser to print it.');
    } finally {
      setSharing(false);
    }
  };

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

        {shareError && (
          <p className="mt-3 text-sm text-ct-rose">{shareError}</p>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          {shareable && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="inline-flex items-center gap-2 px-5 py-2 border border-ct-line text-ct-mute-2 text-sm font-medium rounded-ct-sm hover:bg-ct-surface-2 transition-colors disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {sharing ? 'Preparing PDF' : 'Share'}
            </button>
          )}
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
