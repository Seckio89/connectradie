import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, SkipForward, Clock, Plus, X, AlertTriangle, Send, Trash2 } from 'lucide-react';
import type { RecurringSession, RecurringSessionStatus } from '../lib/recurringJobs';
import {
  rescheduleSession,
  skipSession,
  completeSession,
  addExtraSession,
  cancelExtraSession,
  acceptReschedule,
  insertNotification,
} from '../lib/recurringJobs';
import { getBlockedDates, checkClash } from '../lib/availability';

const STATUS_STYLES: Record<RecurringSessionStatus, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Scheduled' },
  completed: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Completed' },
  rescheduled: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', label: 'Rescheduled' },
  skipped: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-500', label: 'Skipped' },
  extra: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Extra Session' },
};

const DEFAULT_SESSION_DURATION_HOURS = 2;

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = (h + hours) * 60 + m;
  const newH = Math.min(Math.floor(totalMinutes / 60), 23);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
}

interface RecurringSessionCardProps {
  session: RecurringSession;
  recurringJobId: string;
  userRole: 'client' | 'tradie';
  tradieId?: string;
  clientId?: string;
  preferredTime?: string;
  onUpdate: () => void;
}

export default function RecurringSessionCard({
  session,
  recurringJobId,
  userRole,
  tradieId,
  clientId,
  preferredTime,
  onUpdate,
}: RecurringSessionCardProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [showCounterPropose, setShowCounterPropose] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reason, setReason] = useState('');
  const [extraDate, setExtraDate] = useState('');
  const [extraHours, setExtraHours] = useState('');
  const [extraCost, setExtraCost] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [clashWarning, setClashWarning] = useState('');
  const [checkingClash, setCheckingClash] = useState(false);
  const [extraClashWarning, setExtraClashWarning] = useState('');
  const [checkingExtraClash, setCheckingExtraClash] = useState(false);

  const style = STATUS_STYLES[session.status];
  const displayDate = session.actual_date || session.scheduled_date;
  const formattedDate = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const isActionable = session.status === 'scheduled';
  const isTradie = userRole === 'tradie';
  const isClient = userRole === 'client';

  // Tradie proposed a reschedule — homeowner can accept or counter-propose
  const isTradieProposal = session.status === 'rescheduled' && session.reschedule_by === 'tradie';
  // Client proposed a reschedule — tradie can accept or counter-propose
  const isClientProposal = session.status === 'rescheduled' && session.reschedule_by === 'client';

  // Fetch blocked dates when reschedule form opens
  useEffect(() => {
    if ((!showReschedule && !showCounterPropose) || !tradieId) return;
    let cancelled = false;

    const fetchBlocked = async () => {
      try {
        const now = new Date();
        const threeMonths = new Date(now);
        threeMonths.setMonth(threeMonths.getMonth() + 3);
        const dates = await getBlockedDates(
          tradieId,
          now.toISOString().split('T')[0],
          threeMonths.toISOString().split('T')[0],
        );
        if (!cancelled) setBlockedDates(new Set(dates));
      } catch {
        // non-critical
      }
    };

    fetchBlocked();
    return () => { cancelled = true; };
  }, [showReschedule, showCounterPropose, tradieId]);

  // Check clash when reschedule date changes
  useEffect(() => {
    if (!rescheduleDate || !tradieId) {
      setClashWarning('');
      return;
    }

    let cancelled = false;
    const startTime = preferredTime || '09:00:00';
    const endTime = addHoursToTime(startTime, DEFAULT_SESSION_DURATION_HOURS);

    const check = async () => {
      setCheckingClash(true);
      try {
        const hasClash = await checkClash(tradieId, rescheduleDate, startTime, endTime);
        if (!cancelled) {
          setClashWarning(
            hasClash
              ? 'Tradie is unavailable at that time — please choose another date'
              : '',
          );
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setCheckingClash(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [rescheduleDate, tradieId, preferredTime]);

  // Check clash when extra date changes
  useEffect(() => {
    if (!extraDate || !tradieId) {
      setExtraClashWarning('');
      return;
    }

    let cancelled = false;
    const startTime = preferredTime || '09:00:00';
    const endTime = addHoursToTime(startTime, DEFAULT_SESSION_DURATION_HOURS);

    const check = async () => {
      setCheckingExtraClash(true);
      try {
        const hasClash = await checkClash(tradieId, extraDate, startTime, endTime);
        if (!cancelled) {
          setExtraClashWarning(
            hasClash ? 'You already have a booking on this date — choose another' : '',
          );
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setCheckingExtraClash(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [extraDate, tradieId, preferredTime]);

  const handleReschedule = async () => {
    if (!rescheduleDate || !reason.trim() || clashWarning) return;
    setLoading(true);
    try {
      await rescheduleSession(session.id, rescheduleDate, reason.trim(), userRole);

      // Notify the other party
      const proposedDateStr = new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short',
      });

      if (isTradie && clientId) {
        await insertNotification(
          clientId,
          'reschedule_proposal',
          `Your tradie has proposed a new date for ${proposedDateStr} — tap to review`,
          { session_id: session.id, recurring_job_id: recurringJobId, proposed_date: rescheduleDate },
        );
      } else if (isClient && tradieId) {
        await insertNotification(
          tradieId,
          'reschedule_proposal',
          `Your client has proposed a new date for ${proposedDateStr} — tap to review`,
          { session_id: session.id, recurring_job_id: recurringJobId, proposed_date: rescheduleDate },
        );
      }

      resetForms();
      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptReschedule = async () => {
    setLoading(true);
    try {
      await acceptReschedule(session.id);

      // Notify proposer that their date was accepted
      const acceptedDateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
        day: 'numeric', month: 'short',
      });

      if (isClient && tradieId) {
        await insertNotification(
          tradieId,
          'reschedule_accepted',
          `Your proposed date of ${acceptedDateStr} has been accepted`,
          { session_id: session.id, recurring_job_id: recurringJobId },
        );
      } else if (isTradie && clientId) {
        await insertNotification(
          clientId,
          'reschedule_accepted',
          `Your proposed date of ${acceptedDateStr} has been accepted`,
          { session_id: session.id, recurring_job_id: recurringJobId },
        );
      }

      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await skipSession(session.id, reason.trim(), userRole);
      setShowSkip(false);
      setReason('');
      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await completeSession(session.id);
      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleAddExtra = async () => {
    if (!extraDate || extraClashWarning) return;
    setLoading(true);
    try {
      const parsedHours = parseFloat(extraHours) || 0;
      const parsedCost = parseFloat(extraCost) || 0;

      await addExtraSession(
        recurringJobId,
        extraDate,
        parsedHours,
        parsedCost,
        extraNotes.trim(),
        tradieId,
      );

      // Notify homeowner
      if (clientId) {
        const dateStr = new Date(extraDate + 'T00:00:00').toLocaleDateString('en-AU', {
          day: 'numeric', month: 'short',
        });
        await insertNotification(
          clientId,
          'extra_session_added',
          `Your tradie has added an extra session on ${dateStr} for $${parsedCost.toFixed(2)} — this will appear on your next invoice`,
          { recurring_job_id: recurringJobId, date: extraDate, extra_cost: parsedCost },
        );
      }

      setShowExtra(false);
      setExtraDate('');
      setExtraHours('');
      setExtraCost('');
      setExtraNotes('');
      setExtraClashWarning('');
      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleCancelExtra = async () => {
    setLoading(true);
    try {
      await cancelExtraSession(session.id);

      // Notify homeowner
      if (clientId) {
        const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
          day: 'numeric', month: 'short',
        });
        await insertNotification(
          clientId,
          'extra_session_cancelled',
          `An extra session on ${dateStr} has been cancelled`,
          { recurring_job_id: recurringJobId },
        );
      }

      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setShowReschedule(false);
    setShowSkip(false);
    setShowExtra(false);
    setShowCounterPropose(false);
    setReason('');
    setClashWarning('');
    setRescheduleDate('');
  };

  const minDate = new Date().toISOString().split('T')[0];

  // Determine if this user is viewing a proposal from the other party
  const showProposalResponse =
    (isTradieProposal && isClient && !showCounterPropose) ||
    (isClientProposal && isTradie && !showCounterPropose);

  return (
    <div className={`rounded-xl border p-4 ${style.bg} transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900">{formattedDate}</span>
          {session.status === 'rescheduled' && session.scheduled_date !== session.actual_date && (
            <span className="text-xs text-gray-400 line-through">
              {new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text}`}>
          {style.label}
        </span>
      </div>

      {/* Notes / Reason */}
      {session.reschedule_reason && (
        <p className="mt-2 text-xs text-gray-500 italic">
          {session.reschedule_by === 'client' ? 'Client' : 'Tradie'}: {session.reschedule_reason}
        </p>
      )}
      {session.notes && (
        <p className="mt-1 text-xs text-gray-500">{session.notes}</p>
      )}
      {session.status === 'extra' && (
        <div className="mt-2 space-y-1">
          <div className="flex gap-3 text-xs font-medium text-amber-700">
            {session.extra_hours ? <span>{session.extra_hours}h extra</span> : null}
            {session.extra_cost ? <span>${Number(session.extra_cost).toFixed(2)}</span> : null}
          </div>
          {isTradie && (
            <button
              onClick={handleCancelExtra}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-700 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {loading ? 'Cancelling...' : 'Cancel Extra Session'}
            </button>
          )}
        </div>
      )}

      {/* Proposal Response (homeowner sees tradie's proposal, or tradie sees client's proposal) */}
      {showProposalResponse && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-900 mb-2">
            {isTradieProposal ? 'Your tradie proposed' : 'Your client proposed'} a new date:{' '}
            <span className="text-emerald-700 font-semibold">
              {new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
              })}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptReschedule}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Accepting...' : 'Accept New Date'}
            </button>
            <button
              onClick={() => { resetForms(); setShowCounterPropose(true); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-3 h-3" />
              Propose Different Date
            </button>
          </div>
        </div>
      )}

      {/* Counter-propose form */}
      {showCounterPropose && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">Propose a different date</label>
          <input
            type="date"
            value={rescheduleDate}
            min={minDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              clashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {blockedDates.size > 0 && (
            <p className="text-xs text-gray-400">
              {blockedDates.size} date{blockedDates.size !== 1 ? 's' : ''} fully booked
            </p>
          )}
          {checkingClash && (
            <p className="text-xs text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {clashWarning && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 font-medium">{clashWarning}</p>
            </div>
          )}
          <label className="block text-xs font-medium text-gray-600">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., That date doesn't work for me"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReschedule}
              disabled={loading || !rescheduleDate || !reason.trim() || !!clashWarning || checkingClash}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" />
              {loading ? 'Sending...' : 'Send Proposal'}
            </button>
            <button
              onClick={() => { setShowCounterPropose(false); setReason(''); setClashWarning(''); setRescheduleDate(''); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons — only for scheduled sessions */}
      {isActionable && !showReschedule && !showSkip && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isTradie ? (
            <>
              <button
                onClick={() => { resetForms(); setShowReschedule(true); }}
                className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <Send className="w-3 h-3" />
                Propose New Date
              </button>
              <button
                onClick={() => { resetForms(); setShowSkip(true); }}
                className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip
              </button>
              <button
                onClick={handleComplete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                Mark Complete
              </button>
              <button
                onClick={() => { resetForms(); setShowExtra(true); }}
                className="inline-flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Extra Session
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { resetForms(); setShowReschedule(true); }}
                className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <Clock className="w-3 h-3" />
                Reschedule
              </button>
              <button
                onClick={() => { resetForms(); setShowSkip(true); }}
                className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <SkipForward className="w-3 h-3" />
                Skip
              </button>
            </>
          )}
        </div>
      )}

      {/* Extra Session button for completed sessions (tradie only) */}
      {session.status === 'completed' && isTradie && !showExtra && (
        <div className="mt-3">
          <button
            onClick={() => { resetForms(); setShowExtra(true); }}
            className="inline-flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Extra Session
          </button>
        </div>
      )}

      {/* Reschedule / Propose Form */}
      {showReschedule && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">
            {isTradie ? 'Proposed date' : 'New date'}
          </label>
          <input
            type="date"
            value={rescheduleDate}
            min={minDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              clashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {blockedDates.size > 0 && (
            <p className="text-xs text-gray-400">
              {blockedDates.size} date{blockedDates.size !== 1 ? 's' : ''} fully booked in the next 3 months
            </p>
          )}
          {checkingClash && (
            <p className="text-xs text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {clashWarning && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 font-medium">{clashWarning}</p>
            </div>
          )}
          <label className="block text-xs font-medium text-gray-600">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isTradie ? 'e.g., Schedule conflict' : 'e.g., Client unavailable'}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReschedule}
              disabled={loading || !rescheduleDate || !reason.trim() || !!clashWarning || checkingClash}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" />
              {loading ? 'Sending...' : isTradie ? 'Send Proposal' : 'Confirm'}
            </button>
            <button
              onClick={() => { setShowReschedule(false); setReason(''); setClashWarning(''); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Skip Form */}
      {showSkip && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">Reason for skipping</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., On holiday"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              disabled={loading || !reason.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Skipping...' : 'Skip Session'}
            </button>
            <button
              onClick={() => { setShowSkip(false); setReason(''); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Extra Session Form (tradie only) */}
      {showExtra && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">Date</label>
          <input
            type="date"
            value={extraDate}
            min={minDate}
            onChange={(e) => setExtraDate(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              extraClashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {checkingExtraClash && (
            <p className="text-xs text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {extraClashWarning && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 font-medium">{extraClashWarning}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600">Hours</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="12"
                value={extraHours}
                onChange={(e) => setExtraHours(e.target.value)}
                placeholder="2"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Cost (AUD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={extraCost}
                onChange={(e) => setExtraCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <label className="block text-xs font-medium text-gray-600">Notes (optional)</label>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="e.g., Emergency callout for leak"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddExtra}
              disabled={loading || !extraDate || !!extraClashWarning || checkingExtraClash}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              {loading ? 'Adding...' : 'Add Session'}
            </button>
            <button
              onClick={() => { setShowExtra(false); setExtraDate(''); setExtraHours(''); setExtraCost(''); setExtraNotes(''); setExtraClashWarning(''); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
