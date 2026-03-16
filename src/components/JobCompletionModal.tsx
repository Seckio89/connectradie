import { useState, useRef, useMemo } from 'react';
import { Camera, Loader2, X, Plus, AlertCircle, Check } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import type { JobWithRelations } from '../types/database';
import { calculateNextDueDate, FREQ_WEEKLY, insertNotification } from '../lib/recurringJobs';

// ── Quick-text prompts per trade category ──
// Each prompt is a tappable chip the tradie can add to their notes.
// Built from common completion language used in Australian trade invoices,
// HIA contracts, and standard defect-free handover terminology.
const COMPLETION_PROMPTS: Record<string, string[]> = {
  Cleaner: [
    'All rooms deep cleaned and sanitised',
    'Kitchen and bathrooms scrubbed',
    'Floors vacuumed and mopped',
    'Windows and glass cleaned',
    'Rubbish removed from site',
    'Oven and rangehood degreased',
  ],
  Plumber: [
    'Leak repaired and pressure tested',
    'New fixture installed and tested',
    'Blocked drain cleared',
    'Hot water system serviced',
    'Tap washer replaced — no further leaks',
    'Compliance certificate issued',
    'Recommend annual service',
  ],
  Electrician: [
    'New circuit installed and tested',
    'Switchboard upgraded to current standards',
    'Faulty wiring replaced',
    'Smoke alarms tested and compliant',
    'Safety switch (RCD) installed',
    'All points tested — no faults found',
    'Certificate of compliance issued',
  ],
  Builder: [
    'All structural work complete to plans',
    'Frame inspection passed',
    'Lock-up stage reached',
    'Fixing stage complete',
    'Practical completion achieved',
    'Defect-free handover',
    'Site cleaned and cleared',
  ],
  Renovation: [
    'Demolition and strip-out complete',
    'Structural modifications done to spec',
    'All trades signed off',
    'Painting and finishing complete',
    'Final clean done — ready for handover',
    'Client walkthrough completed',
  ],
  Bathroom: [
    'Waterproofing applied and certified (AS 3740)',
    'Tiling complete — all grouted and sealed',
    'Fixtures installed and tested',
    'Plumbing pressure tested — no leaks',
    'Exhaust fan installed and operational',
    'Silicone sealed all wet areas',
  ],
  Kitchen: [
    'Cabinetry installed and aligned',
    'Benchtop fitted and sealed',
    'Splashback tiled and grouted',
    'Plumbing connected — sink tested',
    'Appliances connected and tested',
    'All handles and hardware fitted',
  ],
  Painter: [
    'All surfaces prepped and primed',
    'Two coats applied — even coverage',
    'Trim and edges cut in cleanly',
    'Touch-ups completed',
    'Drop sheets removed — area cleaned',
    'Colour as per client specification',
  ],
  Landscaper: [
    'Garden beds prepared and planted',
    'Turf laid and watered in',
    'Irrigation system installed and tested',
    'Retaining wall built to spec',
    'Paving laid and compacted',
    'Site levelled and cleared',
    'Mulch spread to all garden beds',
  ],
  Carpenter: [
    'First fix framing complete',
    'Second fix — doors, architraves, skirting fitted',
    'Custom joinery installed',
    'Deck built and oiled',
    'Pergola constructed to plans',
    'All timber treated and sealed',
  ],
  Roofer: [
    'Old roof stripped and removed',
    'Sarking and battens installed',
    'New roofing sheets/tiles laid',
    'Flashing and ridgecapping sealed',
    'Gutters and downpipes connected',
    'No leaks — water tested',
  ],
  Concreter: [
    'Formwork set and reinforcement placed',
    'Concrete poured and finished',
    'Expansion joints cut',
    'Surface sealed/coated',
    'Curing period complete',
    'Forms stripped — edges clean',
  ],
  Bricklayer: [
    'Brickwork laid to plan — courses level',
    'Mortar joints tooled and finished',
    'DPC (damp proof course) in place',
    'Lintels installed above openings',
    'Clean-down completed',
    'Ready for next trade',
  ],
  'Pool Builder': [
    'Excavation complete',
    'Steel reinforcement and plumbing in',
    'Shell poured / shotcrete applied',
    'Coping and tiling complete',
    'Equipment installed and commissioned',
    'Pool filled and chemically balanced',
    'Fencing compliant (AS 1926)',
    'Council inspection passed',
  ],
  Fencer: [
    'Post holes dug and posts set in concrete',
    'Rails and palings/panels fixed',
    'Gate hung and latching correctly',
    'All timber treated or coated',
    'Boundary line confirmed with client',
    'Site cleaned up',
  ],
  Demolition: [
    'Asbestos survey completed (pre-demolition)',
    'Structure safely demolished',
    'All waste removed and disposed legally',
    'Site cleared and levelled',
    'Services capped and made safe',
  ],
  Excavation: [
    'Site excavated to required depth',
    'Soil removed / retained as specified',
    'Services located and protected',
    'Site levelled and compacted',
    'Ready for next stage',
  ],
  HVAC: [
    'Unit installed and mounted',
    'Refrigerant lines connected and tested',
    'Electrical connected to standards',
    'System commissioned — cooling/heating tested',
    'Remote and controls programmed',
    'Filter and maintenance info provided',
  ],
  Tiler: [
    'Surface prepared and primed',
    'Tiles laid and levelled',
    'Grouted and sealed',
    'Silicone applied to all edges',
    'No chips or cracks — clean finish',
    'Excess adhesive cleaned up',
  ],
  Locksmith: [
    'Lock replaced / rekeyed',
    'Keys tested and working',
    'Deadbolt installed',
    'All entry points secured',
    'Spare keys provided to client',
  ],
  Pest: [
    'Full property inspected',
    'Treatment applied to affected areas',
    'Bait stations installed',
    'Entry points sealed',
    'Report provided to client',
    'Recommend follow-up in 12 months',
  ],
};

// Fallback prompts for trades not in the map above
const DEFAULT_PROMPTS = [
  'All work completed as quoted',
  'Site left clean and tidy',
  'Tested and confirmed working',
  'No further issues found',
  'Recommend follow-up maintenance',
];

// Map raw job categories (from description prefix) to prompt keys
// e.g. "cleaning_weekly" → "Cleaner", "plumber" → "Plumber"
function matchPromptCategory(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/_/g, ' ');
  const CATEGORY_MAP: Record<string, string> = {
    cleaner: 'Cleaner', cleaning: 'Cleaner', 'cleaning weekly': 'Cleaner', 'house cleaning': 'Cleaner',
    plumber: 'Plumber', plumbing: 'Plumber',
    electrician: 'Electrician', electrical: 'Electrician',
    builder: 'Builder', building: 'Builder',
    renovation: 'Renovation', renovator: 'Renovation',
    bathroom: 'Bathroom', 'bathroom renovation': 'Bathroom',
    kitchen: 'Kitchen', 'kitchen renovation': 'Kitchen',
    painter: 'Painter', painting: 'Painter',
    landscaper: 'Landscaper', landscaping: 'Landscaper', gardener: 'Landscaper', gardening: 'Landscaper',
    carpenter: 'Carpenter', carpentry: 'Carpenter',
    roofer: 'Roofer', roofing: 'Roofer',
    concreter: 'Concreter', concreting: 'Concreter',
    bricklayer: 'Bricklayer', bricklaying: 'Bricklayer',
    fencer: 'Fencer', fencing: 'Fencer',
    demolition: 'Demolition',
    excavation: 'Excavation',
    hvac: 'HVAC', 'air conditioning': 'HVAC', aircon: 'HVAC',
    tiler: 'Tiler', tiling: 'Tiler',
    locksmith: 'Locksmith',
    pest: 'Pest', 'pest control': 'Pest',
  };
  // Exact match first
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  // Partial match — check if any key is contained in the raw string
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

interface PhotoItem {
  file: File;
  preview: string;
}

interface JobCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobWithRelations;
  userId: string;
  onCompleted: () => void;
}

export default function JobCompletionModal({ isOpen, onClose, job, userId, onCompleted }: JobCompletionModalProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const jobCategoryRaw = job.description?.match(/^\[([^\]]+)\]/)?.[1] || '';
  const jobCategory = jobCategoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const jobDesc = job.description?.replace(/^\[[^\]]+\]\s*/, '') || 'Job';

  // Get prompts for this trade, falling back to defaults
  const matchedCategory = matchPromptCategory(jobCategoryRaw);
  const prompts = (matchedCategory && COMPLETION_PROMPTS[matchedCategory]) || COMPLETION_PROMPTS[jobCategory] || DEFAULT_PROMPTS;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError('Only image files (PNG, JPG) are accepted.');
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Each image must be under 10MB.');
        continue;
      }
      if (photos.length >= 5) {
        setError('Maximum 5 photos allowed.');
        break;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, { file, preview: ev.target?.result as string }];
        });
      };
      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());

  // Build notes from selected prompts + any custom text
  const [customNotes, setCustomNotes] = useState('');

  const combinedNotes = useMemo(() => {
    const promptLines = prompts
      .filter((p) => selectedPrompts.has(p))
      .map((p) => `• ${p}`);
    const parts: string[] = [];
    if (promptLines.length > 0) parts.push(promptLines.join('\n'));
    if (customNotes.trim()) parts.push(customNotes.trim());
    return parts.join('\n\n');
  }, [selectedPrompts, customNotes, prompts]);

  // Keep notes in sync
  const notesValue = combinedNotes;

  const togglePrompt = (prompt: string) => {
    setSelectedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(prompt)) {
        next.delete(prompt);
      } else {
        next.add(prompt);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!notesValue.trim()) {
      setError('Please select at least one item or add notes.');
      return;
    }
    const notes = notesValue;

    setSubmitting(true);
    setError(null);

    try {
      // Upload all photos (bucket is private — store paths, use signed URLs to display)
      const photoPaths: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const ext = photo.file.name.split('.').pop() || 'jpg';
        const filePath = `${userId}/${job.id}-completion-${i}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(filePath, photo.file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw new Error(`Failed to upload photo ${i + 1}. Please try again.`);

        photoPaths.push(filePath);
      }

      // Generate a signed URL for the first photo (valid for 1 year) to store as the thumbnail
      let thumbnailUrl: string | null = null;
      if (photoPaths.length > 0) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('job-attachments')
          .createSignedUrl(photoPaths[0], 60 * 60 * 24 * 365);

        if (!signedError && signedData?.signedUrl) {
          thumbnailUrl = signedData.signedUrl;
        }
      }

      // Update job: set status to completed (if not already) + add notes/photo.
      const updateData: Record<string, unknown> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_notes: notes.trim(),
      };
      if (thumbnailUrl) {
        updateData.completion_photo_url = thumbnailUrl;
      }

      const { error: updateError } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', job.id);

      if (updateError) throw new Error('Failed to save completion details. Please try again.');

      // Fetch accepted quote to create a payment record (non-blocking)
      let paymentAmountDisplay = '';
      try {
        const { data: acceptedQuote } = await supabase
          .from('quotes')
          .select('firm_price, price_min, price_max')
          .eq('job_id', job.id)
          .eq('status', 'accepted')
          .maybeSingle();

        const quoteAmount = acceptedQuote?.firm_price || acceptedQuote?.price_max || acceptedQuote?.price_min || 0;
        const amountCents = Math.round(quoteAmount * 100);

        if (amountCents > 0 && job.client_id) {
          const processingFee = Math.round(amountCents * 0.02); // 2% platform fee
          await supabase.from('payments').insert({
            profile_id: job.client_id,
            job_id: job.id,
            payment_type: 'job_funding',
            amount: amountCents,
            processing_fee: processingFee,
            currency: 'aud',
            status: 'pending',
            metadata: { tradie_id: userId, requested_at: new Date().toISOString() },
          });
          paymentAmountDisplay = ` Amount: $${quoteAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}.`;
        }
      } catch {
        // Non-blocking — don't let payment record failure prevent completion
      }

      // Notify client about payment request (non-blocking)
      if (job.client_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: job.client_id,
            title: 'Payment Requested',
            message: `Your tradie has completed the job and requested payment.${paymentAmountDisplay} Please review and release payment.`,
            type: 'payment',
            job_id: job.id,
            metadata: { tradie_id: userId },
          });
        } catch {
          // Non-blocking — don't let notification failure prevent completion
        }
      }

      // Auto-schedule next recurring job if this is a recurring service
      if (job.title && /recurring/i.test(job.title) && job.client_id && job.tradie_id) {
        try {
          // Find the linked recurring_jobs record
          const { data: recurringJob } = await supabase
            .from('recurring_jobs')
            .select('id, frequency_months, is_active, trade_category, service_subtype, agreed_price')
            .eq('client_id', job.client_id)
            .eq('tradie_id', job.tradie_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (recurringJob) {
            // Calculate next date from the completed job's scheduled date or today
            const baseDate = job.scheduled_date || new Date().toISOString().split('T')[0];
            const nextDate = calculateNextDueDate(baseDate, recurringJob.frequency_months);
            const nextDateStr = nextDate.toISOString().split('T')[0];

            // Check if a session already exists for this date
            const { data: existingSession } = await supabase
              .from('recurring_sessions')
              .select('id')
              .eq('recurring_job_id', recurringJob.id)
              .eq('scheduled_date', nextDateStr)
              .maybeSingle();

            if (!existingSession) {
              const confirmationDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
              await supabase.from('recurring_sessions').insert({
                recurring_job_id: recurringJob.id,
                scheduled_date: nextDateStr,
                status: 'pending_confirmation',
                confirmation_deadline: confirmationDeadline,
              });

              // Advance next_due_date
              const followingDate = calculateNextDueDate(nextDateStr, recurringJob.frequency_months);
              await supabase.from('recurring_jobs').update({
                next_due_date: followingDate.toISOString().split('T')[0],
                last_completed_at: new Date().toISOString(),
                times_completed: recurringJob.frequency_months === FREQ_WEEKLY ? undefined : undefined,
              }).eq('id', recurringJob.id);

              // Format labels for notifications
              const tradeLabel = (recurringJob.service_subtype || recurringJob.trade_category || '')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              const nextDateLabel = new Date(nextDateStr + 'T00:00:00').toLocaleDateString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
              });
              const priceStr = recurringJob.agreed_price ? ` — $${recurringJob.agreed_price.toFixed(2)}` : '';

              // Notify client
              await insertNotification(
                job.client_id,
                'session_completed',
                `Your ${tradeLabel} service is complete. Next session (${nextDateLabel}${priceStr}) is awaiting tradie confirmation.`,
                { recurring_job_id: recurringJob.id, next_date: nextDateStr },
              );

              // Notify tradie to confirm
              await insertNotification(
                job.tradie_id,
                'recurring_job_confirmation_required',
                `${tradeLabel} complete. Confirm your next session on ${nextDateLabel}${priceStr} within 48 hours.`,
                { recurring_job_id: recurringJob.id, next_date: nextDateStr },
              );
            }

            // Auto-create service_agreement if one doesn't exist yet
            const { data: existingAgreement } = await supabase
              .from('service_agreements')
              .select('id')
              .eq('client_id', job.client_id)
              .eq('tradie_id', job.tradie_id)
              .eq('trade_category', recurringJob.trade_category)
              .eq('status', 'active')
              .maybeSingle();

            if (!existingAgreement) {
              const freqMap: Record<number, string> = { [-3]: 'daily', [-1]: 'weekly', [-2]: 'fortnightly', 1: 'monthly' };
              await supabase.from('service_agreements').insert({
                client_id: job.client_id,
                tradie_id: job.tradie_id,
                title: recurringJob.service_subtype || recurringJob.trade_category,
                description: job.description?.replace(/^\[[^\]]+\]\s*/, '') || null,
                trade_category: recurringJob.trade_category,
                address: job.location_address || '',
                rate_per_visit: recurringJob.agreed_price || 0,
                typical_frequency: freqMap[recurringJob.frequency_months] || 'weekly',
                status: 'active',
              });
            }
          }
        } catch {
          // Non-blocking — don't fail the completion flow
        }
      }

      onCompleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" closeOnBackdrop={!submitting}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Request Payment</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {jobCategory && <span className="text-secondary-600 font-medium">{jobCategory}</span>}
              {jobCategory && ' — '}{jobDesc}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Work completed checklist */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              What was completed
            </label>
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {prompts.map((prompt) => {
                const isActive = selectedPrompts.has(prompt);
                return (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => togglePrompt(prompt)}
                    disabled={submitting}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-green-50'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                      isActive
                        ? 'bg-green-600 text-white'
                        : 'border-2 border-gray-300'
                    }`}>
                      {isActive && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <span className={`text-sm ${isActive ? 'text-green-900 font-medium' : 'text-gray-700'}`}>
                      {prompt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Additional notes <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              rows={2}
              disabled={submitting}
              placeholder="Any extra details, issues found, or recommendations..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Photos — multi upload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Photos
                <span className="text-gray-400 font-normal normal-case ml-1">— up to 5</span>
              </label>
              {photos.length > 0 && (
                <span className="text-xs text-gray-400">{photos.length}/5</span>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0"
                >
                  <img
                    src={p.preview}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    disabled={submitting}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-md hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {photos.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  className="w-20 h-20 flex-shrink-0 flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50/30 transition-colors group"
                >
                  {photos.length === 0 ? (
                    <Camera className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                  ) : (
                    <Plus className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                  )}
                  <span className="text-xs text-gray-400 group-hover:text-green-600">
                    {photos.length === 0 ? 'Add' : 'More'}
                  </span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          {!notesValue.trim() && (
            <p className="text-xs text-gray-400 text-center">Select at least one item or add notes to continue</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !notesValue.trim()}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                notesValue.trim()
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Request Payment'
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
