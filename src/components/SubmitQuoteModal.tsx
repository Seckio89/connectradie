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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Job } from '../types/database';
import { extractSuburb } from '../lib/contactGating';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';
import { QUOTE_MESSAGE_OPTIONS, resolveMessageOptionsKey } from '../lib/recurringJobs';

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
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [firmPrice, setFirmPrice] = useState('');
  const [useFirmPrice, setUseFirmPrice] = useState(false);
  const [message, setMessage] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days' | 'weeks'>('hours');
  const [durationTBD, setDurationTBD] = useState(false);
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
  const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const suburb = extractSuburb(job.location_address || '') || 'Unknown area';
  const slotsRemaining = job.max_quotes - job.quote_count;
  const businessName = tradieDetails?.business_name || profile?.full_name || 'our team';
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
    const postcode = (job.location_address || '').match(/\b(\d{4})\b/)?.[1];
    if (!postcode) return;

    const postcodePrefix = postcode.slice(0, 2);
    supabase
      .from('quotes')
      .select('price_min, price_max')
      .ilike('job_id', '%')
      .limit(50)
      .then(async () => {
        const { data } = await supabase.rpc('get_price_guidance', {
          p_category: categoryRaw,
          p_postcode_prefix: postcodePrefix,
        }).single();
        if (data && data.avg_min && data.avg_max) {
          setPriceHint({ min: Math.round(data.avg_min / 10) * 10, max: Math.round(data.avg_max / 10) * 10 });
        }
      })
      .catch(() => {});

    // Fallback: direct query if RPC doesn't exist
    supabase
      .from('quotes')
      .select('price_min, price_max, jobs!inner(description, location_address)')
      .ilike('jobs.description', `[${categoryRaw}]%`)
      .ilike('jobs.location_address', `%${postcodePrefix}%`)
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

    // Save message as localStorage template if checkbox is checked
    if (saveAsTemplate && message.trim()) {
      localStorage.setItem('quote_message_template', message.trim());
    }

    const min = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMin);
    const max = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMax);

    const { error: insertError } = await supabase.from('quotes').insert({
      job_id: job.id,
      tradie_id: user.id,
      price_min: min,
      price_max: max,
      firm_price: useFirmPrice ? parseFloat(firmPrice) : null,
      message: message.trim(),
      estimated_duration: estimatedDuration || null,
      includes_materials: includesMaterials,
      proposed_start_date: proposedStartDate || null,
      status: 'pending',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You have already submitted a quote for this job.');
      } else {
        setError('Failed to submit quote. Please try again.');
      }
      setModalState('form');
      return;
    }

    // Notify homeowner via email + in-app
    if (job.client_id) {
      const quoteAmount = useFirmPrice ? parseFloat(firmPrice) : max;
      const amountLabel = useFirmPrice
        ? `$${parseFloat(firmPrice).toFixed(2)}`
        : `$${min.toFixed(2)} – $${max.toFixed(2)}`;
      sendNotification({
        type: NOTIFICATION_TYPES.QUOTE_RECEIVED,
        userId: job.client_id,
        title: 'New Quote Received',
        message: `You've received a new quote of ${amountLabel} for your job. Review it now!`,
        jobId: job.id,
        link: `/leads?job=${job.id}`,
        metadata: {
          amount: amountLabel,
          job_id: job.id,
          tradie_id: user.id,
          quote_amount: quoteAmount,
        },
      }).catch(() => {
        // Non-critical — quote was submitted, email is best-effort
      });
    }

    setModalState('success');
  };

  const handleClose = () => {
    if (modalState === 'success') {
      onQuoteSubmitted();
    }
    setPriceMin('');
    setPriceMax('');
    setFirmPrice('');
    setUseFirmPrice(false);
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
                  <ul className="text-xs text-gray-600 space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-secondary-500 mt-0.5">1.</span>The client reviews your quote</li>
                    <li className="flex items-start gap-2"><span className="text-secondary-500 mt-0.5">2.</span>If accepted, they'll pay into escrow</li>
                    <li className="flex items-start gap-2"><span className="text-secondary-500 mt-0.5">3.</span>You'll be notified to start the job</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-4 max-w-sm">
                  The client will review your quote alongside up to {job.max_quotes - 1} others. You'll be notified if they accept.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 max-w-sm text-left">
                  <p className="text-sm font-semibold text-blue-900 mb-2">What happens next?</p>
                  <ul className="text-xs text-blue-800 space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">1.</span>The client reviews all incoming quotes</li>
                    <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">2.</span>You'll get a notification when they respond</li>
                    <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">3.</span>Track your quote status in the "My Quotes" tab</li>
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

        {modalState === 'form' && (
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
                  <span className="px-2.5 py-0.5 bg-secondary-50 text-secondary-700 rounded-full text-xs font-semibold border border-secondary-200">
                    {category}
                  </span>
                  {slotsRemaining <= 2 && (
                    <span className="px-2.5 py-0.5 bg-warm-50 text-warm-700 rounded-full text-xs font-semibold border border-warm-200">
                      {slotsRemaining} spot{slotsRemaining !== 1 ? 's' : ''} left
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 line-clamp-3">{desc}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {suburb}
                  </span>
                  {job.budget_amount && (
                    <span>Budget: {job.budget_amount.toLocaleString()} AUD</span>
                  )}
                </div>

                {/* Job Photos */}
                {job.images_url && job.images_url.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                      <Image className="w-3 h-3" /> Photos ({job.images_url.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {job.images_url.slice(0, 4).map((url: string, i: number) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-secondary-300 transition-colors">
                          <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
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
              {proposedStartDate && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <Calendar className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-emerald-700">Proposed Start Date</p>
                    <p className="text-sm font-semibold text-emerald-800">
                      {new Date(proposedStartDate + 'T00:00:00').toLocaleDateString('en-AU', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Your Price</label>
                  <button
                    type="button"
                    onClick={() => { setUseFirmPrice(!useFirmPrice); setError(''); }}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      useFirmPrice
                        ? 'bg-secondary-100 text-secondary-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {useFirmPrice ? 'Firm Price' : 'Switch to Firm Price'}
                  </button>
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
                    Provide a range. You can firm up later after speaking with the client.
                  </p>
                )}
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
                            ? 'bg-secondary-500 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        } ${durationTBD ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={durationTBD}
                    onChange={(e) => {
                      setDurationTBD(e.target.checked);
                      if (e.target.checked) setDurationValue('');
                    }}
                    className="rounded border-gray-300 text-secondary-500 focus:ring-secondary-400"
                  />
                  <span className="text-xs text-gray-500">To be confirmed after site visit</span>
                </label>
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
                className={`w-full py-3.5 bg-gradient-to-r from-secondary-500 to-secondary-500 text-white font-semibold rounded-xl hover:from-secondary-600 hover:to-secondary-600 transition-colors shadow-lg shadow-secondary-200 flex items-center justify-center gap-2 text-lg ${
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
