import { proseInputProps } from '../lib/proseInput';
import { useState } from 'react';
import { X, FileText, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';

const REASON_CATEGORIES = [
  { key: 'materials', label: 'Materials cost increase' },
  { key: 'scope_change', label: 'Scope change' },
  { key: 'unforeseen', label: 'Unforeseen issue' },
  { key: 'additional_labour', label: 'Additional labour' },
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
          title: 'Additional cost requested',
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
      <div className="bg-ct-surface rounded-t-2xl sm:rounded-ct-lg max-w-md w-full shadow-xl max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-center justify-between p-5 border-b border-ct-line-soft flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-md flex items-center justify-center">
              <FileText className="w-5 h-5 text-ct-mute-2" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ct-paper">Additional cost</h2>
              {jobBudget != null && jobBudget > 0 && (
                <p className="text-xs text-ct-mute">Original quote: ${jobBudget.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Running total context banner */}
          {approvedVariationsTotal > 0 && (
            <div className="bg-ct-surface-2 border border-ct-line rounded-ct-md p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ct-mute-2 font-medium">Approved add-ons so far</span>
                <span className="text-ct-mute-2 font-bold">+${approvedVariationsTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </div>
              {jobBudget != null && jobBudget > 0 && (
                <div className="flex items-center justify-between text-xs text-ct-mute-2 mt-1 pt-1 border-t border-ct-line">
                  <span>Current running total</span>
                  <span className="font-semibold">${currentTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md text-ct-rose text-sm">
              {error}
            </div>
          )}

          {/* Reason chips */}
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-2">What's the reason?</label>
            <div className="flex flex-wrap gap-2">
              {REASON_CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setReasonCategory(key); setError(''); }}
                  className={`px-3 py-2 rounded-ct-md text-sm font-medium border transition-all ${
                    reasonCategory === key
                      ? 'border-ct-teal bg-ct-amber/[0.13] text-ct-amber shadow-sm'
                      : 'border-ct-line bg-ct-surface text-ct-mute-2 hover:border-ct-line hover:bg-ct-surface-2'
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
              <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
                Additional details {reasonCategory !== 'other' && <span className="text-ct-mute font-normal">(optional)</span>}
              </label>
              <textarea {...proseInputProps}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  reasonCategory === 'materials' ? 'e.g., Timber prices increased since quote was provided' :
                  reasonCategory === 'scope_change' ? 'e.g., Client requested additional power points in the kitchen' :
                  reasonCategory === 'unforeseen' ? 'e.g., Found water damage behind the wall that needs repair' :
                  reasonCategory === 'additional_labour' ? 'e.g., Two-person job required for safe removal of old unit' :
                  'Describe what changed...'
                }
                className="w-full px-3 py-2.5 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm resize-none"
                rows={2}
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ct-mute text-sm font-medium">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm"
                required
              />
            </div>
            {nextMilestoneAmount && !amount && (
              <button
                type="button"
                onClick={useMilestoneSuggestion}
                className="mt-1.5 text-xs text-ct-mute-2 hover:text-ct-mute-2 font-medium"
              >
                Use next milestone amount: ${nextMilestoneAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
              </button>
            )}
            {amountNum > 0 && jobBudget != null && jobBudget > 0 && (
              <p className="mt-1.5 text-xs text-ct-mute">
                New total: <span className="font-semibold text-ct-mute-2">${newTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>

          {/* Photo evidence */}
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
              Supporting photos <span className="text-ct-mute font-normal">(optional, up to 4)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {photoUrls.map((url, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-ct-sm overflow-hidden bg-ct-surface-2 border border-ct-line group">
                  <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-ct-paper" />
                  </button>
                </div>
              ))}
              {photoUrls.length < 4 && (
                <label className={`w-16 h-16 rounded-ct-sm border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                  uploading ? 'border-ct-teal/30 bg-ct-surface-2' : 'border-ct-line hover:border-ct-teal hover:bg-ct-surface-2/50'
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
                    <Loader2 className="w-5 h-5 text-ct-teal animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-ct-mute" />
                  )}
                </label>
              )}
            </div>
            {photoUrls.length === 0 && (
              <p className="text-xs text-ct-mute mt-1">Add a photo of the issue to help the homeowner understand</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-md hover:bg-ct-surface-2 text-sm font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-md hover:brightness-110 disabled:opacity-50 text-sm font-medium transition-colors"
              disabled={loading || !reasonCategory}
            >
              {loading ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
