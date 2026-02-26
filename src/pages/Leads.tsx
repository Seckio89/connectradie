import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap,
  MapPin,
  Clock,
  DollarSign,
  Loader2,
  Briefcase,
  Plus,
  Calendar,
  AlertTriangle,
  WifiOff,
  CalendarDays,
  Sun,
  CloudSun,
  Sunset,
  ShieldAlert,
  Settings,
  FileText,
  Users,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Job, Quote } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';
import VerificationGateModal from '../components/VerificationGateModal';
import SubmitQuoteModal from '../components/SubmitQuoteModal';
import QuoteComparisonView from '../components/QuoteComparisonView';
import { formatDate, checkLicenseExpired } from '../lib/utils';
import { extractSuburb } from '../lib/contactGating';

function FlashCountdown({ expiry, onExpired }: { expiry: string; onExpired?: () => void }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiry).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        if (!expired) {
          setExpired(true);
          onExpired?.();
        }
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry, expired, onExpired]);

  return <span className="font-bold tabular-nums">{timeLeft}</span>;
}

const SLOT_ICONS: Record<string, typeof Sun> = {
  morning: Sun,
  midday: CloudSun,
  afternoon: Sunset,
};

const SLOT_LABELS: Record<string, string> = {
  morning: '7-9 AM',
  midday: '10 AM-12 PM',
  afternoon: '1-5 PM',
};

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays >= 0 && diffDays <= 6) {
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  if (diffDays >= 7 && diffDays <= 13) {
    return `Next Week - ${date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
  }
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

type LeadFilter = 'all' | 'pending' | 'accepted' | 'boosted' | 'urgent' | 'scheduled' | 'quoted';

type LeadWithClient = Job & { client_name?: string; my_quote?: Quote | null };

export default function Leads({ embedded = false }: { embedded?: boolean }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [showVerificationGate, setShowVerificationGate] = useState(false);
  const [gateReason, setGateReason] = useState<'unverified' | 'expired'>('unverified');
  const [quoteModalJob, setQuoteModalJob] = useState<Job | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const isTradie = profile?.role === 'tradie';
  const isVerified = profile?.verification_status === 'verified';
  const isLicenseExpired = checkLicenseExpired(profile?.verification_status, profile?.license_expiry);

  useEffect(() => {
    if (user && profile) {
      fetchLeads();
    }
  }, [user, profile, filter]);

  const fetchLeads = async () => {
    if (!user) return;
    setLoading(true);

    if (isTradie) {
      await fetchTradieLeads();
    } else {
      await fetchClientLeads();
    }
    setLoading(false);
  };

  const fetchTradieLeads = async () => {
    if (!user) return;

    let query = supabase
      .from('jobs')
      .select('*, profiles!jobs_client_id_fkey(full_name)')
      .is('tradie_id', null)
      .eq('status', 'pending')
      .eq('quoting_status', 'open')
      .order('created_at', { ascending: false });

    if (filter === 'boosted') {
      query = query.eq('is_flash_boost', true);
    } else if (filter === 'urgent') {
      query = query.eq('priority', 'urgent');
    } else if (filter === 'scheduled') {
      query = query.eq('priority', 'standard').not('scheduled_date', 'is', null);
    }

    const { data, error } = await query;

    if (!error && data) {
      const { data: myQuotes } = await supabase
        .from('quotes')
        .select('*')
        .eq('tradie_id', user.id)
        .in('job_id', data.map((d: any) => d.id));

      const quoteMap = new Map<string, Quote>();
      (myQuotes || []).forEach((q: Quote) => quoteMap.set(q.job_id, q));

      let mapped = data.map((lead: any) => ({
        ...lead,
        client_name: lead.profiles?.full_name || 'Client',
        my_quote: quoteMap.get(lead.id) || null,
      }));

      if (filter === 'quoted') {
        mapped = mapped.filter((l: LeadWithClient) => l.my_quote);
      }

      setLeads(mapped);
    }
  };

  const fetchClientLeads = async () => {
    if (!user) return;

    let query = supabase
      .from('jobs')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('status', 'pending').is('tradie_id', null);
    } else if (filter === 'accepted') {
      query = query.not('tradie_id', 'is', null);
    } else if (filter === 'boosted') {
      query = query.eq('is_flash_boost', true);
    } else if (filter === 'quoted') {
      query = query.eq('status', 'pending').is('tradie_id', null);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLeads(data);
    }
  };

  const { urgentLeads, scheduledGroups, otherLeads } = useMemo(() => {
    if (!isTradie) return { urgentLeads: [], scheduledGroups: [], otherLeads: leads };

    const now = new Date();
    const urgent: LeadWithClient[] = [];
    const scheduled: LeadWithClient[] = [];
    const other: LeadWithClient[] = [];

    for (const lead of leads) {
      const isFlashActive = lead.is_flash_boost && lead.flash_expiry && new Date(lead.flash_expiry) > now;
      if (lead.priority === 'urgent' || isFlashActive) {
        urgent.push(lead);
      } else if (lead.scheduled_date) {
        scheduled.push(lead);
      } else {
        other.push(lead);
      }
    }

    urgent.sort((a, b) => {
      const aFlash = a.is_flash_boost && a.flash_expiry && new Date(a.flash_expiry) > now;
      const bFlash = b.is_flash_boost && b.flash_expiry && new Date(b.flash_expiry) > now;
      if (aFlash && !bFlash) return -1;
      if (!aFlash && bFlash) return 1;
      return 0;
    });

    scheduled.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

    const groups: { label: string; date: string; leads: LeadWithClient[] }[] = [];
    for (const lead of scheduled) {
      const dateKey = lead.scheduled_date!;
      const existing = groups.find((g) => g.date === dateKey);
      if (existing) {
        existing.leads.push(lead);
      } else {
        groups.push({ label: getDateGroupLabel(dateKey), date: dateKey, leads: [lead] });
      }
    }

    return { urgentLeads: urgent, scheduledGroups: groups, otherLeads: other };
  }, [leads, isTradie]);

  const [offlineQueued] = useState<string | null>(null);

  const handleQuoteClick = (lead: Job) => {
    if (isTradie && isLicenseExpired) {
      setGateReason('expired');
      setShowVerificationGate(true);
      return;
    }

    if (isTradie && !isVerified) {
      setGateReason('unverified');
      setShowVerificationGate(true);
      return;
    }

    setQuoteModalJob(lead);
  };

  const handleFlashExpired = async (leadId: string) => {
    await supabase
      .from('jobs')
      .update({ is_flash_boost: false, flash_expiry: null })
      .eq('id', leadId);

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, is_flash_boost: false, flash_expiry: null } : l
      )
    );
  };

  const handleAcceptQuote = async (quoteId: string) => {
    await supabase
      .from('quotes')
      .update({ status: 'accepted' })
      .eq('id', quoteId);
  };

  const handleDeclineQuote = async (quoteId: string) => {
    await supabase
      .from('quotes')
      .update({ status: 'declined' })
      .eq('id', quoteId);
  };

  const handleMessageTradie = (_tradieId: string) => {
    navigate('/messages');
  };

  const extractCategory = (description: string) => {
    const match = description.match(/^\[([^\]]+)\]/);
    return match ? match[1] : null;
  };

  const cleanDescription = (description: string) => {
    return description.replace(/^\[[^\]]+\]\s*/, '');
  };

  const getClientStatusLabel = (lead: Job) => {
    if (lead.quoting_status === 'awarded') return 'Awarded';
    if (lead.quote_count > 0) return `${lead.quote_count} Quote${lead.quote_count !== 1 ? 's' : ''}`;
    if (lead.tradie_id && lead.status !== 'pending') return 'Picked Up';
    if (lead.is_flash_boost) return 'Boosted';
    if (lead.priority === 'urgent') return 'Urgent';
    if (lead.scheduled_date) return 'Scheduled';
    return 'Waiting';
  };

  const getClientStatusColor = (lead: Job) => {
    if (lead.quoting_status === 'awarded') return 'bg-green-100 text-green-700 border-green-200';
    if (lead.quote_count > 0) return 'bg-teal-100 text-teal-700 border-teal-200';
    if (lead.tradie_id && lead.status !== 'pending') return 'bg-green-100 text-green-700 border-green-200';
    if (lead.is_flash_boost) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (lead.priority === 'urgent') return 'bg-red-100 text-red-700 border-red-200';
    if (lead.scheduled_date) return 'bg-teal-100 text-teal-700 border-teal-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const tradieFilters: { key: LeadFilter; label: string }[] = [
    { key: 'all', label: 'All Leads' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'boosted', label: 'Flash Deals' },
    { key: 'quoted', label: 'My Quotes' },
  ];

  const clientFilters: { key: LeadFilter; label: string }[] = [
    { key: 'all', label: 'All Leads' },
    { key: 'pending', label: 'Waiting' },
    { key: 'accepted', label: 'Awarded' },
    { key: 'boosted', label: 'Boosted' },
  ];

  const filters = isTradie ? tradieFilters : clientFilters;

  const renderLeadCard = (lead: LeadWithClient) => {
    const now = new Date();
    const isFlashActive =
      lead.is_flash_boost &&
      lead.flash_expiry &&
      new Date(lead.flash_expiry) > now;
    const category = extractCategory(lead.description);
    const desc = cleanDescription(lead.description);
    const isUrgent = lead.priority === 'urgent';
    const SlotIcon = lead.preferred_time_slot ? SLOT_ICONS[lead.preferred_time_slot] : null;
    const hasQuoted = isTradie && lead.my_quote;
    const slotsRemaining = lead.max_quotes - lead.quote_count;
    const isClientViewing = !isTradie;
    const showQuoteComparison = isClientViewing && expandedJobId === lead.id && lead.quote_count > 0;

    return (
      <div key={lead.id}>
        <div
          className={`rounded-xl p-5 transition-all ${
            isFlashActive && isTradie
              ? 'border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] bg-gradient-to-r from-amber-50/50 to-white'
              : isUrgent && isTradie
              ? 'border-2 border-red-300 bg-gradient-to-r from-red-50/30 to-white'
              : hasQuoted
              ? 'border-2 border-teal-200 bg-teal-50/20'
              : 'border border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {category && (
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                    {category}
                  </span>
                )}
                {isFlashActive && isTradie && (
                  <>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-full text-xs font-bold shadow-sm animate-pulse">
                      <Zap className="w-3 h-3" />
                      Flash Deal
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-semibold border border-red-200">
                      <AlertTriangle className="w-3 h-3" />
                      Urgent
                    </span>
                  </>
                )}
                {!isFlashActive && isUrgent && isTradie && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-semibold border border-red-200">
                    <Zap className="w-3 h-3" />
                    Urgent
                  </span>
                )}
                {lead.scheduled_date && isTradie && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold border border-teal-200">
                    <CalendarDays className="w-3 h-3" />
                    {new Date(lead.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {lead.preferred_time_slot && isTradie && SlotIcon && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    <SlotIcon className="w-3 h-3" />
                    {SLOT_LABELS[lead.preferred_time_slot]}
                  </span>
                )}
                {isTradie && slotsRemaining <= 2 && slotsRemaining > 0 && !hasQuoted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                    <Users className="w-3 h-3" />
                    {slotsRemaining} spot{slotsRemaining !== 1 ? 's' : ''} left
                  </span>
                )}
                {hasQuoted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-bold border border-teal-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Quoted
                  </span>
                )}
                {!isTradie && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getClientStatusColor(lead)}`}
                  >
                    {getClientStatusLabel(lead)}
                  </span>
                )}
              </div>
              {isTradie && (lead as LeadWithClient).client_name && (
                <p className="text-sm text-gray-600">
                  Posted by {((lead as LeadWithClient).client_name || '').split(' ')[0] || 'Client'}
                </p>
              )}
            </div>

            {isFlashActive && isTradie && (
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-amber-600 font-medium">Ends in</div>
                <FlashCountdown
                  expiry={lead.flash_expiry!}
                  onExpired={() => handleFlashExpired(lead.id)}
                />
              </div>
            )}
          </div>

          <p className="text-gray-800 mb-3 line-clamp-3">{desc}</p>

          {isFlashActive && isTradie && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
              <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-medium text-amber-800">
                Flash Deal -- Quick Quote Priority
              </span>
            </div>
          )}

          {!isTradie && isFlashActive && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <Zap className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-sm text-orange-700">
                We are boosting your lead to find a Tradie faster.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
            {lead.location_address && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span className="truncate max-w-[200px]">
                  {isTradie ? extractSuburb(lead.location_address) || 'Nearby' : lead.location_address}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDate(lead.created_at)}
            </div>
            {lead.budget_amount && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                ${lead.budget_amount.toLocaleString()}
              </div>
            )}
            {!lead.budget_amount && lead.budget_type === 'request_quote' && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                Requesting Quote
              </div>
            )}
          </div>

          {isTradie && !hasQuoted && (
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleQuoteClick(lead)}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all min-h-[44px] ${
                  isFlashActive
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md'
                    : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                Submit Quote
              </button>
            </div>
          )}

          {isTradie && hasQuoted && (
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-teal-50 border border-teal-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-800">
                    You quoted {lead.my_quote!.firm_price
                      ? `$${lead.my_quote!.firm_price.toLocaleString()}`
                      : `$${lead.my_quote!.price_min.toLocaleString()} - $${lead.my_quote!.price_max.toLocaleString()}`
                    }
                  </p>
                  <p className="text-xs text-teal-600">
                    {lead.my_quote!.status === 'pending' ? 'Awaiting client decision' : lead.my_quote!.status}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isTradie && !lead.tradie_id && lead.status === 'pending' && lead.quote_count === 0 && (
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              Waiting for tradies to submit quotes...
            </div>
          )}

          {!isTradie && lead.status === 'pending' && lead.quote_count > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => setExpandedJobId(expandedJobId === lead.id ? null : lead.id)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors text-sm"
              >
                <Eye className="w-4 h-4" />
                {expandedJobId === lead.id ? 'Hide Quotes' : `Review ${lead.quote_count} Quote${lead.quote_count !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {!isTradie && lead.tradie_id && lead.quoting_status === 'awarded' && (
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Quote accepted -- tradie assigned
            </div>
          )}
        </div>

        {showQuoteComparison && (
          <div className="mt-2 p-5 bg-gray-50 rounded-xl border border-gray-200">
            <QuoteComparisonView
              job={lead}
              onAcceptQuote={handleAcceptQuote}
              onDeclineQuote={handleDeclineQuote}
              onMessageTradie={handleMessageTradie}
            />
          </div>
        )}
      </div>
    );
  };

  const renderTradieGroupedView = () => {
    const showGrouped = filter === 'all' || filter === 'scheduled';
    const showUrgent = filter === 'all' || filter === 'urgent';
    const showQuoted = filter === 'quoted';

    if (showQuoted) {
      const quotedLeads = leads.filter((l) => l.my_quote);
      if (quotedLeads.length === 0) {
        return (
          <EmptyState
            icon={FileText}
            title="No Quotes Submitted"
            description="You haven't submitted any quotes yet. Browse available leads and start quoting."
          />
        );
      }
      return (
        <div className="space-y-3">
          {quotedLeads.map(renderLeadCard)}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {showUrgent && urgentLeads.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-red-400 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Urgent / Now</h3>
              <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                {urgentLeads.length}
              </span>
            </div>
            <div className="space-y-3">
              {urgentLeads.map(renderLeadCard)}
            </div>
          </div>
        )}

        {showGrouped && scheduledGroups.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-400 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Scheduled Jobs</h3>
              <span className="ml-auto px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">
                {scheduledGroups.reduce((acc, g) => acc + g.leads.length, 0)}
              </span>
            </div>
            <div className="space-y-5">
              {scheduledGroups.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-teal-600" />
                    <span className="text-sm font-semibold text-teal-700">{group.label}</span>
                    <div className="flex-1 h-px bg-teal-100" />
                  </div>
                  <div className="space-y-3 ml-6">
                    {group.leads.map(renderLeadCard)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showGrouped && otherLeads.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-gray-600" />
              </div>
              <h3 className="font-bold text-gray-900">Other Leads</h3>
              <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                {otherLeads.length}
              </span>
            </div>
            <div className="space-y-3">
              {otherLeads.map(renderLeadCard)}
            </div>
          </div>
        )}

        {urgentLeads.length === 0 && scheduledGroups.length === 0 && otherLeads.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="No Available Leads"
            description="There are no open leads right now. Check back soon -- new jobs are posted regularly."
          />
        )}
      </div>
    );
  };

  const content = (
    <>
      <div className="max-w-7xl mx-auto">
        {offlineQueued && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl animate-pulse">
            <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              You're offline. Your action has been queued and will sync automatically when you're back online.
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isTradie ? 'Available Leads' : 'My Requests'}
            </h1>
            <p className="text-gray-700 mt-1">
              {isTradie
                ? 'Browse open jobs and submit competitive quotes'
                : 'Track your quote requests and compare incoming quotes'}
            </p>
          </div>
          {!isTradie && (
            <Link
              to="/post-lead"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Request a Quote
            </Link>
          )}
        </div>

        {isTradie && isLicenseExpired && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-lg">License Expired</h3>
                <p className="text-red-800 mt-1">
                  Your trade license has expired. You cannot submit quotes until your license is renewed.
                </p>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Upload Renewed License
                </Link>
              </div>
            </div>
          </div>
        )}

        {isTradie && (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Blind quoting:</span> Other tradies cannot see your price. Compete on quality, not just cost.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2.5 rounded-lg font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                  filter === f.key
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : isTradie ? (
            renderTradieGroupedView()
          ) : leads.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No Requests Yet"
              description="You haven't submitted any quote requests yet. Submit one now and tradies in your area will see it."
              actionLabel="Request a Quote"
              onAction={() => (window.location.href = '/post-lead')}
            />
          ) : (
            <div className="space-y-4">
              {leads.map(renderLeadCard)}
            </div>
          )}
        </div>
      </div>

      <VerificationGateModal
        isOpen={showVerificationGate}
        onClose={() => setShowVerificationGate(false)}
        reason={gateReason}
      />

      {quoteModalJob && (
        <SubmitQuoteModal
          isOpen={!!quoteModalJob}
          onClose={() => setQuoteModalJob(null)}
          job={quoteModalJob}
          onQuoteSubmitted={() => {
            setQuoteModalJob(null);
            fetchLeads();
          }}
        />
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
