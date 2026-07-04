import { useState } from 'react';
import { X, AlertCircle, Check, Sparkles, FileText } from 'lucide-react';
import Modal from './Modal';
import type { TradeVacancy, VacancyRoleType, VacancyStatus, EmploymentType, PayPeriod } from '../types/database';
import { EMPLOYMENT_TYPES, PAY_PERIODS, COMMON_TICKETS, ROLE_TEMPLATES, VACANCY_TRADE_OPTIONS, NON_TRADE_CATEGORY } from '../lib/vacancyOptions';

export interface VacancyFormData {
  title: string;
  role_type: VacancyRoleType;
  description: string;
  trade_category: string;
  location: string;
  status: VacancyStatus;
  employment_type: EmploymentType | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: PayPeriod | null;
  pay_note: string | null;
  required_tickets: string[];
  hours: string | null;
  start_date: string | null;
  experience_level: string | null;
  closing_date: string | null;
}

interface PostVacancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: VacancyFormData) => Promise<void>;
  editVacancy?: TradeVacancy | null;
  /** Prefill from an existing listing but save as a NEW one (repost/duplicate). */
  duplicateFrom?: TradeVacancy | null;
}

const ROLE_OPTIONS: { value: VacancyRoleType; label: string; hint: string }[] = [
  { value: 'apprentice', label: 'Apprentice', hint: 'Entry-level training position' },
  { value: 'qualified', label: 'Qualified Tradesperson', hint: 'Licensed / experienced worker' },
  { value: 'senior_advisory', label: 'Senior / Advisory', hint: 'Leadership or mentoring role' },
  { value: 'non_trade', label: 'Office / Support', hint: 'Admin, accounts, operations' },
];

const inputCls =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function PostVacancyModal({ isOpen, onClose, onSave, editVacancy, duplicateFrom }: PostVacancyModalProps) {
  // Prefill source: an edit keeps its identity; a duplicate copies content into
  // a brand-new listing (dates cleared — a repost's old dates are stale).
  const source = editVacancy || duplicateFrom || null;
  const isEdit = !!editVacancy;
  const [form, setForm] = useState({
    title: source?.title || '',
    role_type: (source?.role_type || 'apprentice') as VacancyRoleType,
    description: source?.description || '',
    trade_category: source?.trade_category || '',
    location: source?.location || '',
    employment_type: (source?.employment_type || 'full_time') as EmploymentType,
    pay_min: source?.pay_min != null ? String(source.pay_min) : '',
    pay_max: source?.pay_max != null ? String(source.pay_max) : '',
    pay_period: (source?.pay_period || 'hour') as PayPeriod,
    pay_note: source?.pay_note || '',
    hours: source?.hours || '',
    start_date: isEdit ? (editVacancy?.start_date || '') : '',
    experience_level: source?.experience_level || '',
    closing_date: isEdit ? (editVacancy?.closing_date || '') : '',
  });
  const [tickets, setTickets] = useState<string[]>(source?.required_tickets || []);
  const [saving, setSaving] = useState<false | VacancyStatus>(false);
  const [error, setError] = useState('');

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const toggleTicket = (t: string) =>
    setTickets(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));

  const pickRole = (value: VacancyRoleType) =>
    setForm(f => ({
      ...f,
      role_type: value,
      // sensible employment default when switching to an apprenticeship
      employment_type: value === 'apprentice' ? 'apprenticeship' : f.employment_type,
      // office/support roles auto-fill the non-trade category (still editable)
      trade_category: value === 'non_trade' && !f.trade_category ? NON_TRADE_CATEGORY.value : f.trade_category,
    }));

  const insertTemplate = () => {
    const tpl = ROLE_TEMPLATES[form.role_type];
    setForm(f => ({ ...f, description: f.description.trim() ? f.description : tpl.description }));
    setTickets(prev => Array.from(new Set([...prev, ...tpl.tickets])));
  };

  // Editing an already-open/closed listing keeps its status; everything else
  // (create, duplicate, editing a draft) chooses Draft vs Publish per button.
  const isDraftFlow = !isEdit || editVacancy?.status === 'draft';
  const defaultStatus: VacancyStatus = isDraftFlow ? 'open' : (editVacancy as TradeVacancy).status;

  const submit = async (status: VacancyStatus) => {
    if (!form.title.trim()) return setError('Title is required');
    if (!form.trade_category.trim()) return setError('Trade category is required');
    if (!form.description.trim()) return setError('Description is required');

    const num = (s: string) => {
      const n = parseFloat(s);
      return s.trim() === '' || Number.isNaN(n) ? null : n;
    };
    const str = (s: string) => (s.trim() === '' ? null : s.trim());

    setSaving(status);
    setError('');
    try {
      await onSave({
        title: form.title.trim(),
        role_type: form.role_type,
        description: form.description.trim(),
        trade_category: form.trade_category,
        location: form.location.trim(),
        status,
        employment_type: form.employment_type,
        pay_min: num(form.pay_min),
        pay_max: num(form.pay_max),
        pay_period: form.pay_period,
        pay_note: str(form.pay_note),
        required_tickets: tickets,
        hours: str(form.hours),
        start_date: str(form.start_date),
        experience_level: str(form.experience_level),
        closing_date: str(form.closing_date),
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save vacancy');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(defaultStatus);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {editVacancy ? 'Edit Vacancy' : duplicateFrom ? 'Repost Vacancy' : 'Post a Vacancy'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {editVacancy
              ? 'Update your job listing details'
              : duplicateFrom
                ? 'Review the copied details, set new dates, and post'
                : 'Find your next team member'}
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className={labelCls}>Position Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder='e.g. "1st Year Electrical Apprentice Wanted"'
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Role Type *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickRole(opt.value)}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Trade Category *</label>
            <select value={form.trade_category} onChange={e => set('trade_category', e.target.value)} className={inputCls}>
              <option value="">Select a trade…</option>
              {VACANCY_TRADE_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input
              type="text"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="e.g. Parramatta, NSW"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Employment Type</label>
            <select
              value={form.employment_type}
              onChange={e => set('employment_type', e.target.value as EmploymentType)}
              className={inputCls}
            >
              {EMPLOYMENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Experience</label>
            <input
              type="text"
              value={form.experience_level}
              onChange={e => set('experience_level', e.target.value)}
              placeholder="e.g. 2+ years, or no experience needed"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Pay</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                value={form.pay_min}
                onChange={e => set('pay_min', e.target.value)}
                placeholder="Min"
                className={inputCls + ' pl-7'}
              />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                value={form.pay_max}
                onChange={e => set('pay_max', e.target.value)}
                placeholder="Max"
                className={inputCls + ' pl-7'}
              />
            </div>
            <select value={form.pay_period} onChange={e => set('pay_period', e.target.value as PayPeriod)} className={inputCls}>
              {PAY_PERIODS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={form.pay_note}
              onChange={e => set('pay_note', e.target.value)}
              placeholder="+ super"
              className={inputCls}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Listings with pay get far more applicants. Leave blank for “negotiable”.</p>
        </div>

        <div>
          <label className={labelCls}>Required Tickets &amp; Licences</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_TICKETS.map(t => {
              const on = tickets.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTicket(t)}
                  // rounded-lg (not rounded-full): the mobile CSS adds an
                  // overlapping ::before tap-overlay to every rounded-full
                  // button (meant for toggle switches), which hijacks taps on
                  // these wrapped chips so they can't be selected.
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    on
                      ? 'bg-warm-500 border-warm-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Hours</label>
            <input
              type="text"
              value={form.hours}
              onChange={e => set('hours', e.target.value)}
              placeholder="e.g. Mon–Fri, 38h"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Start Date</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Applications Close</label>
            <input type="date" value={form.closing_date} onChange={e => set('closing_date', e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Description *</label>
            <button
              type="button"
              onClick={insertTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Insert template
            </button>
          </div>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={7}
            placeholder="Describe the role, responsibilities, requirements, and what you offer…"
            className={inputCls + ' resize-none'}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={!!saving}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {isDraftFlow && (
            <button
              type="button"
              onClick={() => submit('draft')}
              disabled={!!saving}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving === 'draft' ? (
                <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Save Draft
            </button>
          )}
          <button
            type="submit"
            disabled={!!saving}
            className="flex-1 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && saving !== 'draft' ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isEdit ? (editVacancy?.status === 'draft' ? 'Publish' : 'Save Changes') : 'Post Vacancy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
