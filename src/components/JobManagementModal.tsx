import { useState, useEffect } from 'react';
import {
  X, Loader2, AlertTriangle, Clock, FileText, Archive, ArchiveRestore,
  MapPin, User, Calendar, Phone, Mail, CheckCircle2,
  Send, ChevronDown, ChevronUp, Repeat, Image,
  Zap, Users, Wrench, Key, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Job } from '../types/database';
import { extractSuburb } from '../lib/contactGating';
import SubmitQuoteModal from './SubmitQuoteModal';

interface JobData {
  id: string;
  client_id: string;
  tradie_id: string | null;
  title: string | null;
  description: string;
  status: string;
  priority: string;
  is_delayed: boolean;
  delayed_until: string | null;
  notes: string | null;
  scheduled_time: string | null;
  scheduled_date: string | null;
  location_address: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  archived_at: string | null;
  created_at: string;
  max_quotes: number | null;
  quote_count: number | null;
  is_emergency: boolean;
  preferred_time_slot: string | null;
  estimated_duration: string | null;
  images_url: string[] | null;
  job_complexity: string | null;
  access_instructions: string | null;
  allows_site_inspection: boolean;
  profiles?: { full_name: string; email: string; phone?: string } | null;
}

interface QuoteData {
  id: string;
  price_min: number;
  price_max: number;
  firm_price: number | null;
  status: string;
  message: string;
  created_at: string;
}

interface JobManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onJobUpdated: () => void;
  isLicenseExpired?: boolean;
}

function parseJobInfo(job: JobData) {
  const categoryMatch = job.description.match(/^\[([^\]]+)\]/);
  const category = categoryMatch?.[1]?.replace(/_/g, ' ') || null;
  const cleanDescription = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const displayTitle = job.title || category || 'Untitled Job';
  return { category, cleanDescription, displayTitle };
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'pending': return { label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' };
    case 'accepted': return { label: 'Accepted', color: 'bg-teal-100 text-teal-800 border-teal-200', dot: 'bg-teal-500' };
    case 'funded': return { label: 'Funded', color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' };
    case 'in_progress': return { label: 'In Progress', color: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' };
    case 'completed': return { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' };
    case 'cancelled': return { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' };
    case 'declined': return { label: 'Declined', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' };
    default: return { label: status, color: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' };
  }
}

function getNextStep(status: string): { action: string; hint: string; nextStatus?: string; buttonColor: string } | null {
  switch (status) {
    case 'pending': return { action: 'Waiting for Client', hint: 'Client is reviewing your quote', buttonColor: 'bg-gray-100 text-gray-600' };
    case 'accepted': return { action: 'Awaiting Payment', hint: 'Client accepted — waiting for escrow payment', buttonColor: 'bg-amber-50 text-amber-700' };
    case 'funded': return { action: 'Mark Complete', hint: 'Payment secured. Mark complete when finished to request payout.', nextStatus: 'in_progress', buttonColor: 'bg-green-600 text-white hover:bg-green-700' };
    case 'in_progress': return { action: 'Mark Complete', hint: 'Finished? Mark complete to request payout.', nextStatus: 'completed', buttonColor: 'bg-green-600 text-white hover:bg-green-700' };
    case 'completed': return { action: 'Job Complete', hint: 'Awaiting client approval and payout release.', buttonColor: 'bg-secondary-50 text-secondary-700' };
    default: return null;
  }
}

export default function JobManagementModal({
  isOpen,
  onClose,
  jobId,
  onJobUpdated,
  isLicenseExpired = false,
}: JobManagementModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<JobData | null>(null);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [priority, setPriority] = useState('normal');
  const [isDelayed, setIsDelayed] = useState(false);
  const [delayedUntil, setDelayedUntil] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteCount, setQuoteCount] = useState(0);

  useEffect(() => {
    if (isOpen && jobId) {
      loadJob();
    }
  }, [isOpen, jobId]);

  const loadJob = async () => {
    setLoading(true);
    const [jobResult, quoteResult, quoteCountResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email, phone)')
        .eq('id', jobId)
        .maybeSingle(),
      user ? supabase
        .from('quotes')
        .select('id, price_min, price_max, firm_price, status, message, created_at')
        .eq('job_id', jobId)
        .eq('tradie_id', user.id)
        .maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId),
    ]);

    if (jobResult.data) {
      const jobData = jobResult.data as unknown as JobData;
      setJob(jobData);
      setPriority(jobData.priority || 'normal');
      setIsDelayed(jobData.is_delayed || false);
      setDelayedUntil(jobData.delayed_until ? new Date(jobData.delayed_until).toISOString().slice(0, 16) : '');
      setNotes(jobData.notes || '');
    }
    if (quoteResult.data) {
      setQuote(quoteResult.data as QuoteData);
    } else if (jobResult.data && (jobResult.data as unknown as JobData).status === 'pending') {
      // Auto-open quote modal for pending jobs with no existing quote
      setShowQuoteModal(true);
    }
    setQuoteCount(quoteCountResult.count || 0);
    setLoading(false);
  };

  const handleStatusAdvance = async (nextStatus: string) => {
    if (isLicenseExpired || !job) return;
    setSaving(true);
    const { error } = await supabase
      .from('jobs')
      .update({ status: nextStatus })
      .eq('id', jobId);

    if (!error) {
      // Notify client about status change
      if (job.client_id) {
        const { displayTitle } = parseJobInfo(job);
        const tradieName = user?.user_metadata?.full_name || 'Your tradie';
        try {
          if (nextStatus === 'in_progress') {
            await supabase.from('notifications').insert({
              user_id: job.client_id,
              type: 'job_update',
              title: 'Work Started',
              message: `${tradieName} has started work on ${displayTitle}.`,
              job_id: jobId,
              metadata: {},
              read: false,
            });
          } else if (nextStatus === 'completed') {
            await supabase.from('notifications').insert({
              user_id: job.client_id,
              type: 'JOB_COMPLETED',
              title: 'Job Completed',
              message: `${tradieName} has completed ${displayTitle}. Please review and release payment.`,
              job_id: jobId,
              metadata: {},
              read: false,
            });
          }
        } catch {
          // Non-critical
        }
      }

      onJobUpdated();
      // Refresh local state
      setJob(prev => prev ? { ...prev, status: nextStatus } : prev);
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (isLicenseExpired) return;
    setSaving(true);
    const { error } = await supabase
      .from('jobs')
      .update({
        priority,
        is_delayed: isDelayed,
        delayed_until: isDelayed && delayedUntil ? new Date(delayedUntil).toISOString() : null,
        notes,
      })
      .eq('id', jobId);

    if (!error && user) {
      // Sync earliest start date to existing quote (if one exists)
      const { data: existingQuote } = await supabase
        .from('quotes')
        .select('id')
        .eq('job_id', jobId)
        .eq('tradie_id', user.id)
        .maybeSingle();

      if (existingQuote) {
        const startDate = isDelayed && delayedUntil ? delayedUntil.slice(0, 10) : null;
        await supabase
          .from('quotes')
          .update({ proposed_start_date: startDate })
          .eq('id', existingQuote.id);
      }

      onJobUpdated();
      onClose();
    }
    setSaving(false);
  };

  const handleArchiveToggle = async () => {
    setSaving(true);
    const newValue = job?.archived_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ archived_at: newValue })
      .eq('id', jobId);

    if (!error) {
      onJobUpdated();
      onClose();
    }
    setSaving(false);
  };

  const isFinished = ['completed', 'cancelled', 'declined'].includes(job?.status || '');
  const isArchived = !!job?.archived_at;
  const canSeeContact = ['funded', 'in_progress', 'completed'].includes(job?.status || '');
  const isRecurring = !!(job?.title && /ongoing|recurring/i.test(job.title));

  if (!isOpen) return null;

  const parsed = job ? parseJobInfo(job) : null;
  const statusConfig = job ? getStatusConfig(job.status) : null;
  const nextStep = job ? getNextStep(job.status) : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 modal-sheet-overlay">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col modal-sheet">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : job && parsed && statusConfig ? (
          <>
            {/* ── Header ── */}
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-secondary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 capitalize">{parsed.displayTitle}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                      {job.priority === 'high' && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200">HIGH PRIORITY</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {parsed.cleanDescription && parsed.cleanDescription !== parsed.displayTitle && (
                <div className="mt-4 bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 bg-secondary-50 text-secondary-700 rounded-full text-xs font-semibold border border-secondary-200">
                      {parsed.category || 'Job'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{parsed.cleanDescription}</p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLicenseExpired && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">License expired — renew to manage jobs.</p>
                </div>
              )}

              {/* ── Quote Now Button ── */}
              {job.status === 'pending' && !quote && !isLicenseExpired && (
                <div className="px-6 pt-4">
                  <button
                    onClick={() => setShowQuoteModal(true)}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 bg-secondary-500 text-white rounded-xl text-sm font-semibold hover:bg-secondary-600 transition-colors shadow-lg shadow-secondary-200"
                  >
                    <Send className="w-4 h-4" />
                    Quote Now
                  </button>
                </div>
              )}

              {/* ── Next Action Banner (non-pending or already quoted) ── */}
              {nextStep && !isLicenseExpired && !(job.status === 'pending' && !quote) && (
                <div className="px-6 pt-4">
                  {nextStep.nextStatus ? (
                    <button
                      onClick={() => handleStatusAdvance(nextStep.nextStatus!)}
                      disabled={saving}
                      className={`w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${nextStep.buttonColor}`}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {nextStep.action}
                    </button>
                  ) : (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${nextStep.buttonColor}`}>
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{nextStep.action}</p>
                        <p className="text-xs opacity-80">{nextStep.hint}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Job Details Grid ── */}
              <div className="px-6 pt-4 space-y-3">
                {/* Client & Contact */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-secondary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-secondary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{job.profiles?.full_name || 'Client'}</p>
                      {canSeeContact && (
                        <div className="flex items-center gap-3 mt-1">
                          {job.profiles?.phone && (
                            <a href={`tel:${job.profiles.phone}`} className="flex items-center gap-1 text-xs text-secondary-600 hover:text-secondary-700">
                              <Phone className="w-3 h-3" />{job.profiles.phone}
                            </a>
                          )}
                          {job.profiles?.email && (
                            <a href={`mailto:${job.profiles.email}`} className="flex items-center gap-1 text-xs text-secondary-600 hover:text-secondary-700">
                              <Mail className="w-3 h-3" />{job.profiles.email}
                            </a>
                          )}
                        </div>
                      )}
                      {!canSeeContact && (
                        <p className="text-xs text-gray-400 mt-0.5">Contact visible after payment is secured</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                {(job.is_emergency || isRecurring) && (
                  <div className="flex flex-wrap gap-1.5">
                    {job.is_emergency && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-semibold border border-red-200">
                        <Zap className="w-3 h-3" /> Emergency
                      </span>
                    )}
                    {isRecurring && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-semibold border border-secondary-200">
                        <Repeat className="w-3 h-3" /> Ongoing
                      </span>
                    )}
                  </div>
                )}

                {/* Budget & How You Got This */}
                {job.status === 'pending' && !quote && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-0.5">Budget</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {job.budget_amount
                          ? `$${job.budget_amount.toLocaleString()}${job.budget_type === 'hourly_rate' ? '/hr' : ''}`
                          : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted')
                            ? 'Quote requested'
                            : 'Not specified'}
                      </p>
                      {(job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted') && !job.budget_amount && (
                        <p className="text-xs text-gray-400 mt-0.5">Client wants you to set the price</p>
                      )}
                    </div>
                    {job.tradie_id ? (
                      <div className="rounded-xl px-3 py-2.5 bg-secondary-50 border border-secondary-200">
                        <p className="text-xs text-gray-500 mb-0.5">Sent To You</p>
                        <p className="text-sm font-semibold text-secondary-700 flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          Private request
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-0.5">Quotes</p>
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {quoteCount} of {job.max_quotes || 5}
                          {quoteCount >= (job.max_quotes || 5) && (
                            <span className="ml-1 px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs border border-red-200">Full</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Your existing quote display */}
                {quote && (
                  <div className="bg-secondary-50 border border-secondary-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Your Quote</p>
                    <p className="text-sm font-semibold text-secondary-800">
                      {quote.firm_price
                        ? `$${quote.firm_price.toLocaleString()}`
                        : `$${quote.price_min.toLocaleString()} – $${quote.price_max.toLocaleString()}`}
                    </p>
                  </div>
                )}

                {/* Key Info Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {job.location_address && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Area</p>
                      <p className="text-sm text-gray-800 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                        <span className="line-clamp-2">
                          {canSeeContact
                            ? job.location_address
                            : extractSuburb(job.location_address) || 'Suburb hidden'}
                        </span>
                      </p>
                      {!canSeeContact && (
                        <p className="text-xs text-gray-400 mt-1">Full address after payment</p>
                      )}
                    </div>
                  )}
                  {job.preferred_time_slot && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Preferred Time</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5 capitalize">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {job.preferred_time_slot}
                      </p>
                    </div>
                  )}
                  {(job.scheduled_date || job.scheduled_time) && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Scheduled</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(job.scheduled_date || job.scheduled_time!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {job.estimated_duration && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Est. Duration</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {job.estimated_duration}
                      </p>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Posted</p>
                    <p className="text-sm text-gray-800">
                      {new Date(job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Access Instructions */}
                {job.access_instructions && (
                  <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                      <Key className="w-3 h-3" /> Access Instructions
                    </p>
                    <p className="text-sm text-gray-800">{job.access_instructions}</p>
                  </div>
                )}

                {/* Photos */}
                {job.images_url && job.images_url.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Image className="w-3 h-3" /> Photos ({job.images_url.length})
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {job.images_url.slice(0, 6).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-primary-300 transition-colors">
                          <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Your Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add private notes about this job..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>

                {/* Job Preferences (collapsible) */}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Your Preferences
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="space-y-3 pb-1">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">Priority</label>
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <EyeOff className="w-3 h-3" /> Only visible to you
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setPriority('low')}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                            priority === 'low' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200'
                          }`}
                        >Low</button>
                        <button
                          onClick={() => setPriority('normal')}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                            priority === 'normal' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-200'
                          }`}
                        >Normal</button>
                        <button
                          onClick={() => setPriority('high')}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                            priority === 'high' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200'
                          }`}
                        >High</button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer border border-gray-200 rounded-lg p-3">
                      <input
                        type="checkbox"
                        checked={isDelayed}
                        onChange={(e) => setIsDelayed(e.target.checked)}
                        className="w-4 h-4 text-secondary-600 rounded focus:ring-secondary-500"
                      />
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">Can&apos;t start yet</span>
                        <p className="flex items-center gap-1 text-xs text-gray-400">
                          <Eye className="w-3 h-3" /> Client will see your earliest available date
                        </p>
                      </div>
                    </label>
                    {isDelayed && (
                      <input
                        type="date"
                        value={delayedUntil ? delayedUntil.slice(0, 10) : ''}
                        onChange={(e) => setDelayedUntil(e.target.value ? `${e.target.value}T00:00` : '')}
                        min={new Date().toISOString().slice(0, 10)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-6 py-4 border-t border-gray-100 space-y-2">
              {isFinished && (
                <button
                  onClick={handleArchiveToggle}
                  disabled={saving}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    isArchived
                      ? 'bg-secondary-50 text-secondary-700 border border-secondary-200 hover:bg-secondary-100'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {isArchived ? <><ArchiveRestore className="w-4 h-4" /> Unarchive</> : <><Archive className="w-4 h-4" /> Archive Job</>}
                </button>
              )}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isLicenseExpired}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary-600 text-white rounded-xl text-sm font-medium hover:bg-secondary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Notes'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-gray-500">Job not found</div>
        )}
      </div>

      {/* SubmitQuoteModal — same full form used in Work Hub */}
      {showQuoteModal && job && (
        <SubmitQuoteModal
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          job={job as unknown as Job}
          onQuoteSubmitted={() => {
            setShowQuoteModal(false);
            loadJob();
            onJobUpdated();
          }}
        />
      )}
    </div>
  );
}
