import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, SkipForward, Clock, Plus, X, AlertTriangle } from 'lucide-react';
import type { RecurringSession, RecurringSessionStatus } from '../lib/recurringJobs';
import {
  rescheduleSession,
  skipSession,
  completeSession,
  addExtraSession,
} from '../lib/recurringJobs';
import { getBlockedDates, checkClash } from '../lib/availability';

const STATUS_STYLES: Record<RecurringSessionStatus, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Scheduled' },
  completed: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Completed' },
  rescheduled: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', label: 'Rescheduled' },
  skipped: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-500', label: 'Skipped' },
  extra: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', label: 'Extra' },
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
  preferredTime?: string;
  onUpdate: () => void;
}

export default function RecurringSessionCard({
  session,
  recurringJobId,
  userRole,
  tradieId,
  preferredTime,
  onUpdate,
}: RecurringSessionCardProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
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

  const style = STATUS_STYLES[session.status];
  const displayDate = session.actual_date || session.scheduled_date;
  const formattedDate = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const isActionable = session.status === 'scheduled' || session.status === 'rescheduled';

  // Fetch blocked dates when reschedule form opens
  useEffect(() => {
    if (!showReschedule || !tradieId) return;
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
        // non-critical — just won't show blocked dates
      }
    };

    fetchBlocked();
    return () => { cancelled = true; };
  }, [showReschedule, tradieId]);

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

  const handleReschedule = async () => {
    if (!rescheduleDate || !reason.trim() || clashWarning) return;
    setLoading(true);
    try {
      await rescheduleSession(session.id, rescheduleDate, reason.trim(), userRole);
      setShowReschedule(false);
      setRescheduleDate('');
      setReason('');
      setClashWarning('');
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
    if (!extraDate) return;
    setLoading(true);
    try {
      await addExtraSession(
        recurringJobId,
        extraDate,
        parseFloat(extraHours) || 0,
        parseFloat(extraCost) || 0,
        extraNotes.trim(),
      );
      setShowExtra(false);
      setExtraDate('');
      setExtraHours('');
      setExtraCost('');
      setExtraNotes('');
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
    setReason('');
    setClashWarning('');
    setRescheduleDate('');
  };

  // Build min attribute for date picker (today)
  const minDate = new Date().toISOString().split('T')[0];

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
      {session.status === 'extra' && (session.extra_hours || session.extra_cost) && (
        <div className="mt-2 flex gap-3 text-xs text-purple-600">
          {session.extra_hours ? <span>{session.extra_hours}h extra</span> : null}
          {session.extra_cost ? <span>${Number(session.extra_cost).toFixed(2)}</span> : null}
        </div>
      )}

      {/* Action Buttons */}
      {isActionable && !showReschedule && !showSkip && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => { resetForms(); setShowReschedule(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Clock className="w-3 h-3" />
            Reschedule
          </button>
          <button
            onClick={() => { resetForms(); setShowSkip(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <SkipForward className="w-3 h-3" />
            Skip
          </button>
          {userRole === 'tradie' && (
            <>
              <button
                onClick={handleComplete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-warm-500 rounded-lg hover:bg-warm-600 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3 h-3" />
                Mark Complete
              </button>
              <button
                onClick={() => { resetForms(); setShowExtra(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Extra Session
              </button>
            </>
          )}
        </div>
      )}

      {/* Reschedule Form */}
      {showReschedule && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">New date</label>
          <input
            type="date"
            value={rescheduleDate}
            min={minDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
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
            placeholder="e.g., Client unavailable"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReschedule}
              disabled={loading || !rescheduleDate || !reason.trim() || !!clashWarning || checkingClash}
              className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Confirm'}
            </button>
            <button
              onClick={() => { setShowReschedule(false); setReason(''); setClashWarning(''); }}
              className="px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-3 h-3" />
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-3 h-3" />
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
            onChange={(e) => setExtraDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600">Extra hours</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={extraHours}
                onChange={(e) => setExtraHours(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Extra cost ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={extraCost}
                onChange={(e) => setExtraCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <label className="block text-xs font-medium text-gray-600">Notes</label>
          <input
            type="text"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="e.g., Emergency callout for leak"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddExtra}
              disabled={loading || !extraDate}
              className="px-4 py-2 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Extra Session'}
            </button>
            <button
              onClick={() => setShowExtra(false)}
              className="px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
