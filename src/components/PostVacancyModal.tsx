import { useState } from 'react';
import { X, AlertCircle, Check } from 'lucide-react';
import Modal from './Modal';
import type { TradeVacancy, VacancyRoleType } from '../types/database';

interface PostVacancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    role_type: VacancyRoleType;
    description: string;
    trade_category: string;
    location: string;
  }) => Promise<void>;
  editVacancy?: TradeVacancy | null;
}

const ROLE_OPTIONS: { value: VacancyRoleType; label: string; hint: string }[] = [
  { value: 'apprentice', label: 'Apprentice', hint: 'Entry-level training position' },
  { value: 'qualified', label: 'Qualified Tradesperson', hint: 'Licensed / experienced worker' },
  { value: 'senior_advisory', label: 'Senior / Advisory', hint: 'Leadership or mentoring role' },
];

export default function PostVacancyModal({ isOpen, onClose, onSave, editVacancy }: PostVacancyModalProps) {
  const [form, setForm] = useState({
    title: editVacancy?.title || '',
    role_type: (editVacancy?.role_type || 'apprentice') as VacancyRoleType,
    description: editVacancy?.description || '',
    trade_category: editVacancy?.trade_category || '',
    location: editVacancy?.location || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!form.description.trim()) {
      setError('Description is required');
      return;
    }
    if (!form.trade_category.trim()) {
      setError('Trade category is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save vacancy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {editVacancy ? 'Edit Vacancy' : 'Post a Vacancy'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {editVacancy ? 'Update your job listing details' : 'Find your next team member'}
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Position Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder='e.g. "1st Year Electrical Apprentice Wanted"'
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Role Type *</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, role_type: opt.value }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  form.role_type === opt.value
                    ? 'border-warm-500 bg-warm-50 ring-1 ring-primary-200'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-semibold ${form.role_type === opt.value ? 'text-primary-700' : 'text-gray-800'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Trade Category *</label>
            <input
              type="text"
              value={form.trade_category}
              onChange={e => setForm(f => ({ ...f, trade_category: e.target.value }))}
              placeholder="e.g. Electrical, Plumbing"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Sydney CBD, Melbourne"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={5}
            placeholder="Describe the role, responsibilities, requirements, and what you offer..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
          />
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
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {editVacancy ? 'Save Changes' : 'Post Vacancy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
