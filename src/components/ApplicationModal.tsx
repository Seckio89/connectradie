import { proseInputProps } from '../lib/proseInput';
import { useState } from 'react';
import { X, AlertCircle, Send, GraduationCap, Award, Briefcase } from 'lucide-react';
import Modal from './Modal';
import type { TradeVacancyWithEmployer } from '../types/database';

const ROLE_LABELS: Record<string, string> = {
  apprentice: 'Apprenticeship',
  qualified: 'Qualified Trade',
  senior_advisory: 'Senior / Advisory',
};

const ROLE_ICONS: Record<string, typeof GraduationCap> = {
  apprentice: GraduationCap,
  qualified: Briefcase,
  senior_advisory: Award,
};

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vacancy: TradeVacancyWithEmployer;
  onSubmit: (coverLetter: string) => Promise<void>;
}

export default function ApplicationModal({ isOpen, onClose, vacancy, onSubmit }: ApplicationModalProps) {
  const [coverLetter, setCoverLetter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const RoleIcon = ROLE_ICONS[vacancy.role_type] || Briefcase;
  const businessName = vacancy.employer_details?.business_name || vacancy.employer?.full_name || 'Unknown';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverLetter.trim()) {
      setError('Please write a brief message about why you are interested in this role.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit(coverLetter.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between p-6 border-b border-ct-line-soft">
        <div>
          <h2 className="text-xl font-bold text-ct-paper">Apply for Position</h2>
          <p className="text-sm text-ct-mute mt-0.5">Send your application to {businessName}</p>
        </div>
        <button onClick={onClose} className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 pt-5 pb-3">
        <div className="bg-ct-surface-2 rounded-ct-md p-4 border border-ct-line-soft">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-ct-md bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
              <RoleIcon className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-ct-paper leading-snug">{vacancy.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-ct-mute">
                <span>{businessName}</span>
                <span className="w-1 h-1 bg-ct-line rounded-full" />
                <span>{ROLE_LABELS[vacancy.role_type]}</span>
                {vacancy.location && (
                  <>
                    <span className="w-1 h-1 bg-ct-line rounded-full" />
                    <span>{vacancy.location}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 pt-3 space-y-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm text-ct-rose text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
            Cover Letter / Message *
          </label>
          <textarea {...proseInputProps}
            value={coverLetter}
            onChange={e => setCoverLetter(e.target.value)}
            rows={6}
            placeholder="Introduce yourself briefly. Mention your experience, qualifications, and why you're interested in this role..."
            className="w-full px-4 py-3 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal outline-none resize-none text-sm leading-relaxed"
          />
          <p className="text-xs text-ct-mute mt-1.5">
            Your profile details (trade, verification status) will be visible to the employer.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 font-medium rounded-ct-md hover:bg-ct-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink font-medium rounded-ct-md hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Submit Application
          </button>
        </div>
      </form>
    </Modal>
  );
}
