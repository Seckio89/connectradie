import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect } from 'react';
import { X, Loader2, XCircle } from 'lucide-react';

interface DeclineJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDecline: (reason: string) => Promise<void>;
  jobDescription: string;
  jobTitle?: string;
}

export default function DeclineJobModal({ isOpen, onClose, onDecline, jobDescription, jobTitle }: DeclineJobModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for declining');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onDecline(reason);
      setReason('');
      onClose();
    } catch {
      setError('Failed to decline job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Build a short summary line from jobTitle or jobDescription
  const summary = jobTitle
    ? jobTitle.replace(/_/g, ' ')
    : (() => {
        const catMatch = jobDescription.match(/^\[([^\]]+)\]/);
        const category = catMatch ? catMatch[1] : '';
        const addressMatch = jobDescription.match(/(\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s*\d{4}\b)/);
        const suburb = addressMatch ? addressMatch[1] : '';
        if (category && suburb) return `${category} · ${suburb}`;
        if (category) return category;
        return jobDescription.length > 60 ? jobDescription.slice(0, 60) + '...' : jobDescription;
      })();

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-ct-surface rounded-ct-lg shadow-2xl z-50 p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ct-rose/[0.13] rounded-full flex items-center justify-center">
              <XCircle className="w-5 h-5 text-ct-rose" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ct-paper">Decline job</h3>
              <p className="text-sm text-ct-mute capitalize">{summary}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-2">
              Reason for declining <span className="text-ct-rose">*</span>
            </label>
            <textarea {...proseInputProps}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder="Let the client know why you can't take this job..."
              rows={3}
              className="w-full px-4 py-3 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal resize-none"
            />
            <p className="text-xs text-ct-mute mt-1.5">
              This helps maintain good relationships with potential clients
            </p>
          </div>

          {error && (
            <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm p-3">
              <p className="text-sm text-ct-rose">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-ct-surface-2 text-ct-mute-2 font-semibold rounded-ct-md hover:bg-ct-line disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className="flex-1 py-3 bg-ct-rose text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Declining...
                </>
              ) : (
                'Decline job'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
