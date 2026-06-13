import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  Send,
  Loader2,
  Package,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Bookmark,
  ChevronDown,
  Image,
  Calendar,
  Repeat,
  Eye,
  Car,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Job } from '../types/database';
import { extractSuburb } from '../lib/contactGating';
import { QUOTE_MESSAGE_OPTIONS, resolveMessageOptionsKey } from '../lib/recurringJobs';
import { useTradieVerification } from '../hooks/useTradieVerification';
import { useSignedUrls } from '../hooks/useSignedUrl';

interface QuoteTemplate {
  id: string;
  name: string;
  message: string;
  default_duration: string | null;
  includes_materials: boolean;
}


interface SubmitQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  proposedStartDate?: string | null;
  onQuoteSubmitted: () => void;
}

const DURATION_UNITS = ['hours', 'days', 'weeks'] as const;

type ModalState = 'form' | 'submitting' | 'success';

interface DurationPill {
  label: string;
  value: string;
  unit: 'hours' | 'days' | 'weeks';
}

const DURATION_PILLS: Record<string, DurationPill[]> = {
  short: [
    { label: '1h', value: '1', unit: 'hours' },
    { label: '2h', value: '2', unit: 'hours' },
    { label: 'Half day', value: '4', unit: 'hours' },
    { label: 'Full day', value: '8', unit: 'hours' },
  ],
  medium: [
    { label: '2h', value: '2', unit: 'hours' },
    { label: '4h', value: '4', unit: 'hours' },
    { label: 'Half day', value: '4', unit: 'hours' },
    { label: 'Full day', value: '8', unit: 'hours' },
  ],
  long: [
    { label: '1 day', value: '1', unit: 'days' },
    { label: '2-3 days', value: '3', unit: 'days' },
    { label: '1 week', value: '1', unit: 'weeks' },
    { label: '2+ weeks', value: '2', unit: 'weeks' },
  ],
};

function getDurationPillsForTrade(trade: string): DurationPill[] {
  const t = trade.toLowerCase();
  if (/build|carpent|chippy|cabinet|concret|brick|plaster|demolit|scaffold|earthmov|stone/.test(t)) return DURATION_PILLS.long;
  if (/plumb|electric|sparky|air.?con|hvac|locksmith|antenna|security/.test(t)) return DURATION_PILLS.short;
  return DURATION_PILLS.medium;
}

function shouldDefaultMaterials(trade: string): boolean {
  const t = trade.toLowerCase();
  return /clean|paint|landscap|garden|lawn|mow/.test(t);
}

export default function SubmitQuoteModal({
  isOpen,
  onClose,
  job,
  proposedStartDate,
  onQuoteSubmitted,
}: SubmitQuoteModalProps) {
  const { user, profile, tradieDetails } = useAuth();

  // Use explicit prop, or fall back to job's "Can't start yet" date
  const effectiveStartDate = proposedStartDate
    || (job.is_delayed && job.delayed_until ? job.delayed_until.slice(0, 10) : null);

  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [firmPrice, setFirmPrice] = useState('');
  // Default to firm price — simpler for tradies, range is optional
  const [useFirmPrice, setUseFirmPrice] = useState(true);
  const [message, setMessage] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days' | 'weeks'>('hours');
  const [durationTBD, setDurationTBD] = useState(false);
  // Call-out fee (3-stage flow): the client pays this at booking, it's routed to
  // the tradie, and credited against the final price if they proceed. UI clamp $20-$100.
  const [callOutFee, setCallOutFee] = useState('40');
  const estimatedDuration = durationTBD
    ? 'TBD after inspection'
    : durationValue
      ? `${durationValue} ${durationUnit}`
      : '';
  const [includesMaterials, setIncludesMaterials] = useState(false);
  const [error, setError] = useState('');
  const [modalState, setModalState] = useState<ModalState>('form');
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('quote_templates')
      .select('*')
      .eq('tradie_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setTemplates(data as QuoteTemplate[]);
  }, [user]);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen, fetchTemplates]);

  const applyTemplate = (t: QuoteTemplate) => {
    setMessage(t.message);
    if (t.default_duration) {
      const match = t.default_duration.match(/^(\d+)\s*(hours|days|weeks)$/);
      if (match) {
        setDurationValue(match[1]);
        setDurationUnit(match[2] as 'hours' | 'days' | 'weeks');
        setDurationTBD(false);
      } else if (t.default_duration === 'TBD after inspection') {
        setDurationTBD(true);
      }
    }
    setIncludesMaterials(t.includes_materials);
    setShowTemplates(false);
  };

  const handleSaveTemplate = async () => {
    if (!user || !templateName.trim() || !message.trim()) return;
    setSavingTemplate(true);
    await supabase.from('quote_templates').insert({
      tradie_id: user.id,
      name: templateName.trim(),
      message: message.trim(),
      default_duration: estimatedDuration || null,
      includes_materials: includesMaterials,
    });
    setTemplateName('');
    setShowSaveTemplate(false);
    setSavingTemplate(false);
    fetchTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    await supabase.from('quote_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const categoryRaw = job.description.match(/^\[([^\]]+)\]/)?.[1] || 'Job';
  const category = categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  // Verification gate: a tradie must have identity + ABN (and licence, for
  // licensed trades) before they can submit a quote. See useTradieVerification.
  const verification = useTradieVerification(categoryRaw === 'Job' ? null : categoryRaw);

  // Resolve signed URLs for the job's photos (job-attachments bucket).
  const photoSignedUrls = useSignedUrls('job-attachments', job.images_url || []);
  const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const suburb = extractSuburb(job.location_address || '') || 'Unknown area';
  const slotsRemaining = job.max_quotes - job.quote_count;
  const isRecurring = !!(job.title && /ongoing|recurring/i.test(job.title));
  const businessName = tradieDetails?.business_name || profile?.full_name || 'our team';

  // Prefill the call-out fee from the tradie's saved default, if they have one.
  useEffect(() => {
    const def = (tradieDetails as { default_call_out_fee_cents?: number | null } | null)?.default_call_out_fee_cents;
    if (def != null && def > 0) setCallOutFee(String(Math.round(def / 100)));
  }, [tradieDetails]);
  const tradeType = tradieDetails?.trade_category || category.toLowerCase();

  // Resolve which message options to show based on job trade/category
  const messageOptionsKey = useMemo(() =>
    resolveMessageOptionsKey(
      (job as Record<string, unknown>).service_subtype as string | undefined,
      tradeType,
      category,
    ),
    [tradeType, category, job]
  );
  const messageOptions = QUOTE_MESSAGE_OPTIONS[messageOptionsKey] || QUOTE_MESSAGE_OPTIONS['default'];

  const [messageOptionIndex, setMessageOptionIndex] = useState(0);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [priceHint, setPriceHint] = useState<{ min: number; max: number } | null>(null);
  const [selectedPill, setSelectedPill] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const durationPills = useMemo(() => getDurationPillsForTrade(tradeType), [tradeType]);

  // Fetch price guidance from similar quotes
  useEffect(() => {
    if (!isOpen) return;
    setPriceHint(null);

    supabase
      .from('quotes')
      .select('price_min, price_max')
      .eq('status', 'pending')
      .limit(20)
      .then(({ data }) => {
        if (!data || data.length < 3) return;
        const mins = data.map((q: Record<string, unknown>) => q.price_min as number).sort((a: number, b: number) => a - b);
        const maxes = data.map((q: Record<string, unknown>) => q.price_max as number).sort((a: number, b: number) => a - b);
        const trimmedMin = mins.slice(1, -1);
        const trimmedMax = maxes.slice(1, -1);
        const avgMin = trimmedMin.reduce((a: number, b: number) => a + b, 0) / trimmedMin.length;
        const avgMax = trimmedMax.reduce((a: number, b: number) => a + b, 0) / trimmedMax.length;
        if (avgMin > 0 && avgMax > 0) {
          setPriceHint({ min: Math.round(avgMin / 10) * 10, max: Math.round(avgMax / 10) * 10 });
        }
      })
      .catch(() => {});
  }, [isOpen, categoryRaw, job.location_address]);

  // Auto-load first message option (or saved template) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const saved = localStorage.getItem('quote_message_template');
    if (saved) {
      setMessage(saved);
    } else {
      setMessage(messageOptions[0]);
      setMessageOptionIndex(0);
    }
    setSaveAsTemplate(false);
    setMessageExpanded(false);
    setSelectedPill(null);
    setIncludesMaterials(shouldDefaultMaterials(tradeType));
  }, [isOpen, messageOptions, tradeType]);

  const handleCycleMessage = () => {
    const next = (messageOptionIndex + 1) % messageOptions.length;
    setMessageOptionIndex(next);
    setMessage(messageOptions[next]);
  };

  const handlePillClick = (pill: DurationPill) => {
    if (selectedPill === pill.label) {
      setSelectedPill(null);
      setDurationValue('');
      return;
    }
    setSelectedPill(pill.label);
    setDurationValue(pill.value);
    setDurationUnit(pill.unit);
    setDurationTBD(false);
  };

  const hasPriceEntered = useFirmPrice
    ? !!firmPrice && parseFloat(firmPrice) > 0
    : !!priceMin && !!priceMax && parseFloat(priceMin) > 0 && parseFloat(priceMax) > 0;
  const hasDurationEntered = durationTBD || !!durationValue;
  const canSubmit = hasPriceEntered && hasDurationEntered && !!message.trim();

  const handleSubmit = async () => {
    if (!user) return;

    if (!useFirmPrice) {
      if (!priceMin || !priceMax) {
        setError('Please enter a price range.');
        return;
      }
      if (parseFloat(priceMin) > parseFloat(priceMax)) {
        setError('Minimum price cannot exceed maximum price.');
        return;
      }
      if (parseFloat(priceMin) <= 0) {
        setError('Price must be greater than zero.');
        return;
      }
    } else {
      if (!firmPrice) {
        setError('Please enter your firm price.');
        return;
      }
      if (parseFloat(firmPrice) <= 0) {
        setError('Price must be greater than zero.');
        return;
      }
    }

    if (!message.trim()) {
      setError('Please include a brief message to the client.');
      return;
    }

    setModalState('submitting');
    setError('');

    // Check for existing quote before attempting insert
    const { data: existingQuote } = await supabase
      .from('quotes')
      .select('id')
      .eq('job_id', job.id)
      .eq('tradie_id', user.id)
      .maybeSingle();

    if (existingQuote) {
      setError('You have already submitted a quote for this job.');
      setModalState('form');
      return;
    }

    // Save message as localStorage template if checkbox is checked
    if (saveAsTemplate && message.trim()) {
      localStorage.setItem('quote_message_template', message.trim());
    }

    const min = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMin);
    const max = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMax);

    // Call-out fee only applies when a site visit is required. Clamp to $20-$100.
    const callOutFeeCents = durationTBD
      ? Math.min(10000, Math.max(2000, Math.round((Number(callOutFee) || 40) * 100)))
      : null;

    const { error: insertError } = await supabase.from('quotes').insert({
      job_id: job.id,
      tradie_id: user.id,
      price_min: min,
      price_max: max,
      firm_price: useFirmPrice ? parseFloat(firmPrice) : null,
      message: message.trim(),
      estimated_duration: estimatedDuration || null,
      includes_materials: includesMaterials,
      proposed_start_date: effectiveStartDate || null,
      requires_site_inspection: durationTBD,
      call_out_fee_cents: callOutFeeCents,
      status: 'pending',
    });

    if (insertError) {
      console.error('Quote insert failed:', insertError);
      if (insertError.code === '23505') {
        setError('You have already submitted a quote for this job.');
      } else if (insertError.code === '42501') {
        // RLS policy violation — job may not be open for quoting
        setError('This job is no longer accepting quotes.');
      } else if (insertError.message?.includes('column')) {
        setError('Quote submission error — please contact support.');
      } else {
        setError(`Failed to submit quote: ${insertError.message || 'Please try again.'}`);
      }
      setModalState('form');
      return;
    }

    // A site-inspection quote moves this job onto the 3-stage flow (book visit →
    // final quote → pay), so the client books a paid site visit instead of
    // depositing the full budget up front. The flip is handled server-side by the
    // `trg_flip_job_three_stage` trigger on `quotes` (SECURITY DEFINER) — it cannot
    // be done here because RLS blocks a tradie from updating the client's job row
    // (tradie_id is NULL on a pending job, so the UPDATE would match zero rows).

    // Remember this call-out fee as the tradie's default for next time (non-critical).
    if (callOutFeeCents) {
      await supabase
        .from('tradie_details')
        .update({ default_call_out_fee_cents: callOutFeeCents })
        .eq('profile_id', user.id)
        .then(undefined, (e) => console.warn('Failed to save default call-out fee:', e));
    }

    // In-app notification is handled by the DB trigger `notify_client_new_quote`
    // (fires on quotes INSERT). No frontend sendNotification needed here.

    setModalState('success');
  };

  const handleClose = () => {
    if (modalState === 'success') {
      onQuoteSubmitted();
    }
    setPriceMin('');
    setPriceMax('');
    setFirmPrice('');
    // Default state has site visit OFF → firm price mode
    setUseFirmPrice(true);
    setMessage('');
    setDurationValue('');
    setDurationUnit('hours');
    setDurationTBD(false);
    setIncludesMaterials(false);
    setError('');
    setModalState('form');
    setMessageExpanded(false);
    setSelectedPill(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'submitting' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-secondary-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Submitting Quote...</h2>
            <p className="text-gray-600">Sending your quote to the client.</p>
          </div>
        )}

        {modalState === 'success' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Quote Submitted</h2>
            {job.tradie_id ? (
              <>
                <p className="text-gray-600 mb-4 max-w-sm">
                  Your quote has been sent directly to the client. They'll review it and get back to you.
                </p>
                <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4 mb-6 max-w-sm text-left">
                  <p className="text-sm font-semibold text-gray-800 mb-2">What happens next?</p>
                  <ul className="text-xs text-gray-600 space-y-2">
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>1</span>The client reviews your quote</li>
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>2</span>If accepted, they'll pay securely via Stripe</li>
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>3</span>You'll be notified to start the job</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-4 max-w-sm">
                  The client will review your quote alongside up to {job.max_quotes - 1} others. You'll be notified if they accept.
                </p>
                <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4 mb-6 max-w-sm text-left">
                  <p className="text-sm font-semibold text-secondary-900 mb-2">What happens next?</p>
                  <ul className="text-xs text-secondary-800 space-y-2">
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>1</span>The client reviews all incoming quotes</li>
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>2</span>You'll get a notification when they respond</li>
                    <li className="flex items-start gap-2.5"><span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: '#2E86DE', color: 'white' }}>3</span>Track your quote status in the "My Quotes" tab</li>
                  </ul>
                </div>
              </>
            )}
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-secondary-600 text-white font-semibold rounded-xl hover:bg-secondary-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Verification gate — replaces the form when the tradie can't quote
            on this trade. Server-side enforcement also exists in
            submit-final-quote (defence in depth). */}
        {modalState === 'form' && !verification.loading && !verification.canQuote && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Get verified to quote</h2>
            <p className="text-sm text-gray-600 mb-5 max-w-sm mx-auto">
              ConnecTradie verifies every tradie before they can quote — it&apos;s how clients trust the platform.
              {verification.requiresLicense && (
                <> This job requires a contractor licence for <span className="font-semibold">{category}</span>.</>
              )}
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-5 max-w-sm mx-auto">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">Still required:</p>
              <ul className="space-y-1.5">
                {verification.blockingReasons.map(reason => (
                  <li key={reason} className="text-sm text-amber-900 flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/verification"
              onClick={handleClose}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Go to Verification Center
            </Link>
          </div>
        )}

        {modalState === 'form' && verification.canQuote && (
          <>
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-secondary-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Submit Quote</h2>
                  <p className="text-sm text-gray-500">Blind quoting -- other tradies can't see your price</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-medium border border-secondary-200">
                    {category}
                  </span>
                  {slotsRemaining <= 2 && (
                    <span className="px-3 py-1 bg-warm-50 text-warm-700 rounded-full text-xs font-medium border border-warm-200">
                      {slotsRemaining} spot{slotsRemaining !== 1 ? 's' : ''} left
                    </span>
                  )}
                </div>
                {isRecurring && (
                  <p className="text-xs text-secondary-600 flex items-center gap-1.5">
                    <Repeat className="w-3 h-3 flex-shrink-0" />
                    Ongoing service — if accepted, you'll be the regular tradie for this service
                  </p>
                )}
                <p className="text-sm text-gray-700">{desc}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {suburb}
                  </span>
                  {job.budget_amount ? (
                    <span>Budget: ${job.budget_amount.toLocaleString()}</span>
                  ) : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted') ? (
                    <span>Quote requested</span>
                  ) : null}
                  {typeof job.parking_available === 'boolean' && (
                    <span className={`flex items-center gap-1 ${job.parking_available ? 'text-emerald-600' : 'text-gray-500'}`}>
                      <Car className="w-3 h-3" />
                      {job.parking_available ? 'Parking on site' : 'No parking'}
                    </span>
                  )}
                </div>

                {/* Job Photos */}
                {job.images_url && job.images_url.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                      <Image className="w-3 h-3" /> Photos ({job.images_url.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {job.images_url.slice(0, 4).map((_: string, i: number) => {
                        const signedUrl = photoSignedUrls[i];
                        return (
                          <a key={i} href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-secondary-300 transition-colors">
                            {signedUrl
                              ? <img src={signedUrl} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                              : <div className="w-full h-full bg-gray-100" />}
                          </a>
                        );
                      })}
                      {job.images_url.length > 4 && (
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50">
                          <span className="text-xs text-gray-500 font-medium">+{job.images_url.length - 4}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {effectiveStartDate && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-emerald-700">Earliest Available Date</p>
                    <p className="text-sm font-semibold text-emerald-800">
                      {new Date(effectiveStartDate + 'T00:00:00').toLocaleDateString('en-AU', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {job.budget_amount != null && job.budget_amount > 0 ? (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Client's budget:</span>
                  <span className="text-sm font-medium text-gray-900">${job.budget_amount.toLocaleString()}</span>
                </div>
              ) : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted') ? (
                <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Client wants a quote — submit your best competitive price.</p>
                </div>
              ) : null}

              {/* Site Visit Required toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !durationTBD;
                  setDurationTBD(next);
                  if (next) {
                    setDurationValue('');
                    // Site visit ON → range mode (an honest estimate, not a firm number)
                    setUseFirmPrice(false);
                    setFirmPrice('');
                  } else {
                    // Site visit OFF → firm price only (no range — tradie can quote upfront)
                    setUseFirmPrice(true);
                    setPriceMin('');
                    setPriceMax('');
                  }
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                  durationTBD
                    ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  durationTBD ? 'bg-amber-100' : 'bg-gray-100'
                }`}>
                  <Eye className={`w-4 h-4 ${durationTBD ? 'text-amber-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${durationTBD ? 'text-amber-800' : 'text-gray-700'}`}>
                    Site visit required
                  </p>
                  <p className="text-xs text-gray-500">
                    Price and duration are estimates until I inspect the site
                  </p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center flex-shrink-0 ${
                  durationTBD ? 'bg-amber-500' : 'bg-gray-300'
                }`}>
                  <span className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    durationTBD ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </div>
              </button>

              {durationTBD && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    The client will see this as an estimated quote. Final price and timeframe will be confirmed after your on-site inspection.
                  </p>
                </div>
              )}

              {durationTBD && (
                <div className="px-3 py-3 bg-white border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-gray-500" />
                    <label className="text-sm font-medium text-gray-700">Call-out fee for the visit</label>
                  </div>
                  <div className="relative max-w-[140px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                    <input
                      type="number"
                      min={20}
                      max={100}
                      step={5}
                      value={callOutFee}
                      onChange={(e) => setCallOutFee(e.target.value)}
                      onBlur={() => {
                        const n = Math.round(Number(callOutFee) || 0);
                        setCallOutFee(String(Math.min(100, Math.max(20, n))));
                      }}
                      className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-secondary-400 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    The client pays this when they book your visit — it goes to you, and comes off their final bill if they go ahead. $20–$100.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">
                    {durationTBD ? 'Estimated Range' : 'Your Price'}
                    {profile?.is_gst_registered && (
                      <span className="ml-1.5 text-xs font-normal text-gray-500">(ex. GST)</span>
                    )}
                  </label>
                </div>

                {useFirmPrice ? (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                    <input
                      type="number"
                      value={firmPrice}
                      onChange={(e) => setFirmPrice(e.target.value)}
                      placeholder="Your firm price (AUD)"
                      min="0"
                      step="10"
                      className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                      <input
                        type="number"
                        value={priceMin}
                        onChange={(e) => setPriceMin(e.target.value)}
                        placeholder="Min"
                        min="0"
                        step="10"
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary-500 text-sm"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                      <input
                        type="number"
                        value={priceMax}
                        onChange={(e) => setPriceMax(e.target.value)}
                        placeholder="Max"
                        min="0"
                        step="10"
                        className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary-500 text-sm"
                      />
                    </div>
                  </div>
                )}
                {!useFirmPrice && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Give your best-case and worst-case estimate. You'll confirm the final price after visiting the site.
                  </p>
                )}
                {profile?.is_gst_registered && (() => {
                  const firm = parseFloat(firmPrice);
                  const min = parseFloat(priceMin);
                  const max = parseFloat(priceMax);
                  if (useFirmPrice && firm > 0) {
                    return (
                      <p className="mt-1.5 text-xs text-secondary-600">
                        Client pays <span className="font-semibold">${(firm * 1.1).toFixed(2)}</span> total
                        <span className="text-gray-400"> (${firm.toFixed(2)} + ${(firm * 0.1).toFixed(2)} GST)</span>
                      </p>
                    );
                  }
                  if (!useFirmPrice && min > 0 && max > 0) {
                    return (
                      <p className="mt-1.5 text-xs text-secondary-600">
                        Client pays <span className="font-semibold">${(min * 1.1).toFixed(2)} – ${(max * 1.1).toFixed(2)}</span> total
                        <span className="text-gray-400"> (incl. 10% GST)</span>
                      </p>
                    );
                  }
                  return null;
                })()}
                {priceHint && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Typical range for similar jobs: ${priceHint.min.toLocaleString()} – ${priceHint.max.toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Message to Client</label>
                  {templates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTemplates(!showTemplates)}
                      className="flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700 px-2 py-1 rounded-lg hover:bg-secondary-50 transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      Templates
                      <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {showTemplates && templates.length > 0 && (
                  <div className="mb-3 border border-secondary-200 rounded-xl overflow-hidden divide-y divide-secondary-100">
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 hover:bg-secondary-50 transition-colors">
                        <button
                          type="button"
                          onClick={() => { applyTemplate(t); setMessageExpanded(true); }}
                          className="flex-1 text-left"
                        >
                          <span className="text-sm font-medium text-gray-900">{t.name}</span>
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{t.message}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!messageExpanded ? (
                  <button
                    type="button"
                    onClick={() => setMessageExpanded(true)}
                    className="w-full flex justify-between items-start px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-all duration-200"
                  >
                    <span className="text-left">{message.length > 60 ? message.slice(0, 60) + '...' : message}</span>
                    <span className="text-emerald-600 text-sm flex-shrink-0 ml-3">Edit</span>
                  </button>
                ) : (
                  <div className="transition-all duration-200">
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm"
                    />

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Not the right tone?{' '}
                        <button
                          type="button"
                          onClick={handleCycleMessage}
                          className="text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          Try another &rarr;
                        </button>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-300">{messageOptionIndex + 1} of {messageOptions.length}</span>
                        <button
                          type="button"
                          onClick={() => setMessageExpanded(false)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          Done editing
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAsTemplate}
                        onChange={(e) => setSaveAsTemplate(e.target.checked)}
                        className="rounded border-gray-300 text-secondary-500 focus:ring-secondary-400"
                      />
                      <span className="text-xs text-gray-500">Save this message for next time</span>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated duration
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {durationPills.map((pill) => (
                    <button
                      key={pill.label}
                      type="button"
                      disabled={durationTBD}
                      onClick={() => handlePillClick(pill)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        selectedPill === pill.label
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      } ${durationTBD ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="999"
                    placeholder="e.g. 3"
                    value={durationValue}
                    onChange={(e) => { setDurationValue(e.target.value.replace(/[^0-9]/g, '')); setSelectedPill(null); }}
                    disabled={durationTBD}
                    className={`w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-secondary-400 focus:border-secondary-400 ${
                      durationTBD ? 'bg-gray-100 text-gray-400' : ''
                    }`}
                  />
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                    {DURATION_UNITS.map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        disabled={durationTBD}
                        onClick={() => setDurationUnit(unit)}
                        className={`px-3 py-2 text-sm capitalize transition-colors ${
                          durationUnit === unit && !durationTBD
                            ? 'bg-secondary-50 text-secondary-700 border border-secondary-300'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        } ${durationTBD ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-secondary-300 cursor-pointer transition-colors"
                  htmlFor="includes-materials"
                >
                  <input
                    id="includes-materials"
                    type="checkbox"
                    checked={includesMaterials}
                    onChange={(e) => setIncludesMaterials(e.target.checked)}
                    className="w-4 h-4 text-secondary-600 rounded border-gray-300 focus:ring-secondary-500"
                  />
                  <Package className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">Quote includes materials</span>
                </label>

              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
                <Wrench className="w-4 h-4 flex-shrink-0" />
                <span>
                  Quoting as <strong>{tradieDetails?.business_name || profile?.full_name}</strong>
                  {profile?.verification_status === 'verified' && ' (Verified)'}
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full py-3.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm flex items-center justify-center gap-2 text-lg ${
                  !canSubmit ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Send className="w-5 h-5" />
                Submit Quote
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
