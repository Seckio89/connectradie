import { useState } from 'react';
import { X, FileText, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';

const REASON_CATEGORIES = [
  { key: 'materials', label: 'Materials Cost Increase' },
  { key: 'scope_change', label: 'Scope Change' },
  { key: 'unforeseen', label: 'Unforeseen Issue' },
  { key: 'additional_labour', label: 'Additional Labour' },
  { key: 'other', label: 'Other' },
] as const;

interface RequestVariationModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSuccess: () => void;
  jobBudget?: number | null;
  approvedVariationsTotal?: number;
  nextMilestoneAmount?: number | null;
}

export default function RequestVariationModal({
  isOpen, onClose, jobId, onSuccess,
  jobBudget, approvedVariationsTotal = 0, nextMilestoneAmount,
}: RequestVariationModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const currentTotal = (jobBudget || 0) + approvedVariationsTotal;
  const amountNum = parseFloat(amount) || 0;
  const newTotal = currentTotal + amountNum;

  const handlePhotoUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const uploaded: string[] = [];
      for (let i = 0; i < Math.min(files.length, 4 - photoUrls.length); i++) {
        const file = files[i];
        const ext = file.name.split('.').pop();
        const path = `${user.id}/variations/${jobId}/${Date.now()}-${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('job-images').upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('job-images').getPublicUrl(path);
        uploaded.push(publicUrl);
      }
      setPhotoUrls(prev => [...prev, ...uploaded]);
    } catch {
      setError('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reasonCategory) {
      setError('Please select a reason');
      return;
    }

    if (reasonCategory !== 'other' && !description.trim() && reasonCategory) {
      // description optional for non-other categories, but amount required
    }

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount greater than $0');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('client_id, description')
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      const reasonLabel = REASON_CATEGORIES.find(r => r.key === reasonCategory)?.label || reasonCategory;
      const fullDescription = description.trim()
        ? `${reasonLabel}: ${description.trim()}`
        : reasonLabel;

      const { error: insertError } = await supabase
        .from('job_variations')
        .insert({
          job_id: jobId,
          description: fullDescription,
          additional_amount: amountNum,
          status: 'pending',
          reason_category: reasonCategory,
          photo_urls: photoUrls,
        });

      if (insertError) throw insertError;

      if (jobData?.client_id) {
        await sendNotification({
          type: NOTIFICATION_TYPES.VARIATION_REQUEST,
          userId: jobData.client_id,
          title: 'Additional Cost Requested',
          message: `${reasonLabel} - $${amountNum.toFixed(2)} requested${description.trim() ? `: ${description.trim()}` : ''}. Please review and approve.`,
          jobId: jobId,
          metadata: {
            amount: amountNum.toFixed(2),
            variation_description: fullDescription,
            reason_category: reasonCategory,
          },
        });
      }

      setDescription('');
      setAmount('');
      setReasonCategory(null);
      setPhotoUrls([]);
      onSuccess();
      onClose();
    } catch {
      setError('Failed to send request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const useMilestoneSuggestion = () => {
    if (nextMilestoneAmount) {
      setAmount(String(nextMilestoneAmount));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Additional Cost</h2>
              {jobBudget != null && jobBudget > 0 && (
                <p className="text-xs text-gray-500">Original quote: ${jobBudget.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Running total context banner */}
          {approvedVariationsTotal > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-700 font-medium">Approved add-ons so far</span>
                <span className="text-blue-800 font-bold">+${approvedVariationsTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </div>
              {jobBudget != null && jobBudget > 0 && (
                <div className="flex items-center justify-between text-xs text-blue-600 mt-1 pt-1 border-t border-blue-200">
                  <span>Current running total</span>
                  <span className="font-semibold">${currentTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Reason chips */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">What's the reason?</label>
            <div className="flex flex-wrap gap-2">
              {REASON_CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setReasonCategory(key); setError(''); }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                    reasonCategory === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional description -- shown when reason selected */}
          {reasonCategory && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Additional details {reasonCategory !== 'other' && <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  reasonCategory === 'materials' ? 'e.g., Timber prices increased since quote was provided' :
                  reasonCategory === 'scope_change' ? 'e.g., Client requested additional power points in the kitchen' :
                  reasonCategory === 'unforeseen' ? 'e.g., Found water damage behind the wall that needs repair' :
                  reasonCategory === 'additional_labour' ? 'e.g., Two-person job required for safe removal of old unit' :
                  'Describe what changed...'
                }
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                rows={2}
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
              />
            </div>
            {nextMilestoneAmount && !amount && (
              <button
                type="button"
                onClick={useMilestoneSuggestion}
                className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Use next milestone amount: ${nextMilestoneAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
              </button>
            )}
            {amountNum > 0 && jobBudget != null && jobBudget > 0 && (
              <p className="mt-1.5 text-xs text-gray-500">
                New total: <span className="font-semibold text-gray-700">${newTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>

          {/* Photo evidence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Supporting photos <span className="text-gray-400 font-normal">(optional, up to 4)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {photoUrls.map((url, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 group">
                  <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              {photoUrls.length < 4 && (
                <label className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                  uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                }`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)}
                    disabled={uploading}
                  />
                  {uploading ? (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-gray-400" />
                  )}
                </label>
              )}
            </div>
            {photoUrls.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Add a photo of the issue to help the homeowner understand</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 text-sm font-medium transition-colors"
              disabled={loading || !reasonCategory}
            >
              {loading ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
