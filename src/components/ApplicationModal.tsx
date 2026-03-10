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
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Apply for Position</h2>
          <p className="text-sm text-gray-500 mt-0.5">Send your application to {businessName}</p>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 pt-5 pb-3">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
              <RoleIcon className="w-5 h-5 text-secondary-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 leading-snug">{vacancy.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span>{businessName}</span>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <span>{ROLE_LABELS[vacancy.role_type]}</span>
                {vacancy.location && (
                  <>
                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
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
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Cover Letter / Message *
          </label>
          <textarea
            value={coverLetter}
            onChange={e => setCoverLetter(e.target.value)}
            rows={6}
            placeholder="Introduce yourself briefly. Mention your experience, qualifications, and why you're interested in this role..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none text-sm leading-relaxed"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            Your profile details (trade, verification status) will be visible to the employer.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
