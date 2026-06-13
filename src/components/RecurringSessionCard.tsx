import { useState, useEffect, useRef } from 'react';
import { Calendar, CheckCircle2, SkipForward, Clock, Plus, X, AlertTriangle, Send, Trash2, MoreVertical } from 'lucide-react';
import type { RecurringSession, RecurringSessionStatus } from '../lib/recurringJobs';
import {
  rescheduleSession,
  skipSession,
  completeSession,
  confirmSession,
  declineSession,
  addExtraSession,
  cancelExtraSession,
  acceptReschedule,
  insertNotification,
} from '../lib/recurringJobs';
import { supabase } from '../lib/supabase';
import { getBlockedDates, checkClash } from '../lib/availability';

const STATUS_STYLES: Record<RecurringSessionStatus, { bg: string; text: string; label: string }> = {
  pending_confirmation: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-700', label: 'Awaiting Confirmation' },
  scheduled: { bg: 'bg-secondary-50 border-secondary-200', text: 'text-secondary-700', label: 'Scheduled' },
  awaiting_completion: { bg: 'bg-orange-50 border-orange-300', text: 'text-orange-700', label: 'Confirm Completion' },
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

/** Format HH:MM:SS or HH:MM to 12h display e.g. "9:00 AM" */
function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Overflow menu for secondary actions
interface RecurringSessionCardProps {
  session: RecurringSession;
  recurringJobId: string;
  userRole: 'client' | 'tradie';
  tradieId?: string;
  clientId?: string;
  preferredTime?: string;
  agreedPrice?: number | null;
  serviceName?: string;
  showApplyToAll?: boolean;
  onApplyToAll?: (startTime: string, endTime: string | null) => void;
  onUpdate: () => void;
}

export default function RecurringSessionCard({
  session,
  recurringJobId,
  userRole,
  tradieId,
  clientId,
  preferredTime,
  agreedPrice,
  serviceName,
  showApplyToAll,
  onApplyToAll,
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
  const [supplyCostInput, setSupplyCostInput] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [checkingExtraClash, setCheckingExtraClash] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showChangeTime, setShowChangeTime] = useState(false);
  const [newStartTime, setNewStartTime] = useState(session.start_time?.slice(0, 5) || preferredTime?.slice(0, 5) || '');
  const [newEndTime, setNewEndTime] = useState(session.end_time?.slice(0, 5) || '');

  // Sync form state when session data changes or form opens
  useEffect(() => {
    setNewStartTime(session.start_time?.slice(0, 5) || preferredTime?.slice(0, 5) || '');
    setNewEndTime(session.end_time?.slice(0, 5) || '');
  }, [session.start_time, session.end_time, preferredTime, showChangeTime]);

  // Close actions menu on click outside
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionsMenu]);

  const now = new Date();
  // Use AEST to avoid UTC date mismatch before 10am AEST
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

  // Send real-time notification when session becomes overdue
  const overdueNotifiedRef = useRef(false);

  // Session is overdue if: past date, OR today but end_time has passed
  const isOverdue = (session.status === 'scheduled' || session.status === 'extra') && (() => {
    if (session.scheduled_date < today) return true;
    if (session.scheduled_date === today) {
      const endTime = session.end_time || (session.start_time ? addHoursToTime(session.start_time, DEFAULT_SESSION_DURATION_HOURS) : null);
      if (endTime) {
        const [h, m] = endTime.split(':').map(Number);
        const endDate = new Date(now);
        endDate.setHours(h, m, 0, 0);
        return now >= endDate;
      }
    }
    return false;
  })();
  // Notify tradie + client in real-time when session becomes overdue
  useEffect(() => {
    if (!isOverdue || overdueNotifiedRef.current) return;
    // Use localStorage to avoid duplicate notifications across tabs/sessions
    const storageKey = `overdue_notified_${session.id}`;
    if (localStorage.getItem(storageKey)) return;
    overdueNotifiedRef.current = true;
    localStorage.setItem(storageKey, '1');

    const tradeLabel = serviceName || 'service';
    const dateStr = new Date((session.actual_date || session.scheduled_date) + 'T00:00:00')
      .toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

    const notify = async () => {
      if (tradieId) {
        await insertNotification(
          tradieId,
          'session_overdue',
          `Your ${tradeLabel} visit on ${dateStr} has ended — please confirm if the job was completed`,
          { session_id: session.id, recurring_job_id: recurringJobId, session_date: session.scheduled_date },
        );
      }
      if (clientId) {
        await insertNotification(
          clientId,
          'session_overdue',
          `Your ${tradeLabel} visit on ${dateStr} has ended — waiting for tradie to confirm completion`,
          { session_id: session.id, recurring_job_id: recurringJobId, session_date: session.scheduled_date },
        );
      }
    };

    notify().catch(() => { /* non-critical */ });
  }, [isOverdue, session.id, tradieId, clientId, serviceName, session.actual_date, session.scheduled_date, recurringJobId]);

  // Auto-complete sessions that are overdue by more than 24 hours (safety net for cron)
  const autoCompleteRef = useRef(false);
  useEffect(() => {
    if (!isOverdue || autoCompleteRef.current) return;
    // Only auto-complete if the session date is before today (not same-day overdue)
    if (session.scheduled_date >= today) return;
    const storageKey = `auto_completed_${session.id}`;
    if (localStorage.getItem(storageKey)) return;
    autoCompleteRef.current = true;
    localStorage.setItem(storageKey, '1');

    const autoComplete = async () => {
      try {
        await completeSession(session.id);
        onUpdate();
      } catch {
        // Non-critical — cron will catch it
      }
    };
    autoComplete();
  }, [isOverdue, session.id, session.scheduled_date, today, onUpdate]);

  const style = isOverdue
    ? { bg: 'bg-red-50 border-red-300', text: 'text-red-700', label: 'Not Completed' }
    : STATUS_STYLES[session.status];
  const displayDate = session.actual_date || session.scheduled_date;
  const formattedDate = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const isPendingConfirmation = session.status === 'pending_confirmation';
  const isActionable = session.status === 'scheduled' || session.status === 'extra';
  const isAwaitingCompletion = session.status === 'awaiting_completion';
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

      const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

      // Notify the other party
      if (isTradie && clientId) {
        await insertNotification(
          clientId,
          'session_skipped',
          `Your ${serviceName || 'service'} visit on ${dateStr} has been skipped: "${reason.trim()}"`,
          { session_id: session.id, recurring_job_id: recurringJobId, session_date: session.scheduled_date },
        );
      } else if (isClient && tradieId) {
        await insertNotification(
          tradieId,
          'session_skipped',
          `Your client skipped the visit on ${dateStr}: "${reason.trim()}"`,
          { session_id: session.id, recurring_job_id: recurringJobId, session_date: session.scheduled_date },
        );
      }

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
      // Save supply cost BEFORE completing (avoid race condition)
      const supplyCost = supplyCostInput ? parseFloat(supplyCostInput) : 0;
      if (supplyCost > 0 && !isNaN(supplyCost)) {
        await supabase
          .from('recurring_sessions')
          .update({ supply_cost: supplyCost })
          .eq('id', session.id);
      }

      await completeSession(session.id);
      setSupplyCostInput('');

      // Notify the client that the visit has been completed
      if (isTradie && clientId) {
        const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        await insertNotification(
          clientId,
          'session_completed',
          `Your ${serviceName || 'service'} visit on ${dateStr} has been completed by your tradie`,
          { session_id: session.id, recurring_job_id: recurringJobId, session_date: session.scheduled_date },
        );
      }

      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (enableAutoAccept?: boolean) => {
    setLoading(true);
    try {
      await confirmSession(session.id);

      // Enable auto-accept for future sessions if requested
      if (enableAutoAccept) {
        try {
          await supabase
            .from('recurring_jobs')
            .update({ auto_accept: true })
            .eq('id', recurringJobId);
        } catch {
          // Non-critical
        }
      }

      onUpdate();
    } catch {
      // handled by parent
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    try {
      await declineSession(session.id, declineReason.trim() || undefined);
      setShowDeclineForm(false);
      setDeclineReason('');
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

  const handleSaveTime = async () => {
    if (!newStartTime) return;
    setLoading(true);
    try {
      // Both client and tradie set time directly
      const { error } = await supabase
        .from('recurring_sessions')
        .update({
          start_time: newStartTime + ':00',
          end_time: newEndTime ? newEndTime + ':00' : null,
          proposed_start_time: null,
          proposed_end_time: null,
          time_proposal_by: null,
        })
        .eq('id', session.id);
      if (error) throw error;

      const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      const timeStr = `${formatTime12h(newStartTime)}${newEndTime ? ` – ${formatTime12h(newEndTime)}` : ''}`;

      // Notify the other party
      if (isClient && tradieId) {
        await insertNotification(
          tradieId,
          'time_updated',
          `Visit time for ${dateStr} updated to ${timeStr}`,
          { session_id: session.id, recurring_job_id: recurringJobId },
        );
      } else if (isTradie && clientId) {
        await insertNotification(
          clientId,
          'time_updated',
          `Your tradie updated the visit time for ${dateStr} to ${timeStr}`,
          { session_id: session.id, recurring_job_id: recurringJobId },
        );
      }

      onUpdate();
    } catch {
      // columns may not exist yet — still close form
    } finally {
      setLoading(false);
      resetForms();
    }
  };

  const handleAcceptTimeProposal = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('recurring_sessions')
        .update({
          start_time: session.proposed_start_time,
          end_time: session.proposed_end_time,
          proposed_start_time: null,
          proposed_end_time: null,
          time_proposal_by: null,
        })
        .eq('id', session.id);
      if (error) throw error;

      // Notify tradie that time was accepted
      if (tradieId) {
        const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        await insertNotification(
          tradieId,
          'time_accepted',
          `Your proposed time for ${dateStr} has been accepted`,
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

  const handleDeclineTimeProposal = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('recurring_sessions')
        .update({
          proposed_start_time: null,
          proposed_end_time: null,
          time_proposal_by: null,
        })
        .eq('id', session.id);
      if (error) throw error;

      // Notify tradie that time was declined
      if (tradieId) {
        const dateStr = new Date(displayDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        await insertNotification(
          tradieId,
          'time_declined',
          `Your proposed time for ${dateStr} was declined`,
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

  const resetForms = () => {
    setShowReschedule(false);
    setShowSkip(false);
    setShowExtra(false);
    setShowCounterPropose(false);
    setShowChangeTime(false);
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
      <div className="space-y-1.5">
        {/* Row 1: Date + Price + Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900">{formattedDate}</span>
            {session.status === 'rescheduled' && session.scheduled_date !== session.actual_date && (
              <span className="text-xs text-gray-400 line-through">
                {new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {agreedPrice != null && agreedPrice > 0 && session.status !== 'extra' && (
              <span className="text-xs font-semibold text-emerald-700">${agreedPrice.toFixed(2)}</span>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>
        </div>
        {/* Row 2: Time badge + Apply to All (if time is set) */}
        {(() => {
          const arrival = session.start_time?.slice(0, 5) || preferredTime?.slice(0, 5);
          const finish = session.end_time?.slice(0, 5) || (arrival ? addHoursToTime(arrival, DEFAULT_SESSION_DURATION_HOURS).slice(0, 5) : null);
          return arrival ? (
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 font-semibold">
                <Clock className="w-3 h-3" />
                {formatTime12h(arrival)}{finish ? ` – ${formatTime12h(finish)}` : ''}
              </span>
              {showApplyToAll && onApplyToAll && (
                <button
                  onClick={(e) => { e.stopPropagation(); onApplyToAll(arrival, finish); }}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2 transition-colors"
                >
                  Apply to All
                </button>
              )}
            </div>
          ) : null;
        })()}
        {serviceName && (
          <p className="text-xs text-gray-500 capitalize truncate ml-6">{serviceName}</p>
        )}
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
        <div className="mt-2">
          <div className="flex gap-3 text-xs font-medium text-amber-700">
            {session.extra_hours ? <span>{session.extra_hours}h extra</span> : null}
            {session.extra_cost ? <span>${Number(session.extra_cost).toFixed(2)}</span> : null}
          </div>
        </div>
      )}

      {/* Pending Confirmation — tradie must confirm or decline */}
      {isPendingConfirmation && isTradie && !showDeclineForm && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
          {agreedPrice != null && agreedPrice > 0 && (
            <p className="text-sm font-semibold text-emerald-600 mb-1">
              ${agreedPrice.toFixed(2)} <span className="text-xs font-normal text-gray-500">agreed rate</span>
            </p>
          )}
          <p className="text-xs font-medium text-gray-900 mb-1">
            Please confirm this session by{' '}
            <span className="text-amber-700 font-semibold">
              {session.confirmation_deadline
                ? new Date(session.confirmation_deadline).toLocaleDateString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })
                : '48 hours'}
            </span>
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => handleConfirm(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Confirming...' : 'Confirm'}
            </button>
            <button
              onClick={() => handleConfirm(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Confirm & Auto Accept
            </button>
            <button
              onClick={() => setShowDeclineForm(true)}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <X className="w-3 h-3" />
              Can't Do This One
            </button>
          </div>
        </div>
      )}

      {/* Pending Confirmation — client sees waiting state */}
      {isPendingConfirmation && isClient && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-700 font-medium">
            <Clock className="w-3 h-3 inline mr-1" />
            {tradieId
              ? 'Waiting for tradie to confirm this session'
              : 'Waiting for a tradie to be assigned to this service'}
            {agreedPrice != null && agreedPrice > 0 && tradieId && (
              <span className="text-gray-600"> — ${agreedPrice.toFixed(2)} agreed rate</span>
            )}
          </p>
        </div>
      )}

      {/* Awaiting Completion — tradie opted out of auto-complete; cron parked
          this session here and is waiting for the tradie to confirm in person. */}
      {isAwaitingCompletion && isTradie && !showSkip && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-orange-200">
          <p className="text-xs font-medium text-orange-800 mb-2">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            Did you finish this visit? Mark it complete so the client can be invoiced.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={handleComplete}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Confirming...' : 'Mark Complete'}
            </button>
            <button
              onClick={() => { resetForms(); setShowSkip(true); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              Didn't Happen
            </button>
          </div>
        </div>
      )}

      {/* Awaiting Completion — client view: explain we're waiting on the tradie */}
      {isAwaitingCompletion && isClient && (
        <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-800 font-medium">
            <Clock className="w-3 h-3 inline mr-1" />
            Waiting for your tradie to confirm this visit was completed before invoicing.
          </p>
        </div>
      )}

      {/* Decline — compact inline */}
      {showDeclineForm && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <label className="text-[10px] font-medium text-gray-400 uppercase flex-shrink-0">Reason</label>
            <input
              type="text"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Optional — schedule conflict..."
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleDecline}
            disabled={loading}
            className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Declining...' : 'Decline'}
          </button>
          <button
            onClick={() => { setShowDeclineForm(false); setDeclineReason(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
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

      {/* Time Proposal Response — client sees tradie's proposed time */}
      {session.time_proposal_by === 'tradie' && isClient && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-900 mb-2">
            Your tradie proposed a new time:{' '}
            <span className="text-emerald-700 font-semibold">
              {session.proposed_start_time ? formatTime12h(session.proposed_start_time) : ''}
              {session.proposed_end_time ? ` – ${formatTime12h(session.proposed_end_time)}` : ''}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptTimeProposal}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Accepting...' : 'Accept Time'}
            </button>
            <button
              onClick={handleDeclineTimeProposal}
              disabled={loading}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <X className="w-3 h-3" />
              Decline
            </button>
            <button
              onClick={() => { resetForms(); setShowChangeTime(true); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-3 h-3" />
              Set Different Time
            </button>
          </div>
        </div>
      )}

      {/* Time Proposal Pending — tradie sees their pending proposal */}
      {session.time_proposal_by === 'tradie' && isTradie && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs font-medium text-amber-800">
            <Clock className="w-3 h-3 inline mr-1" />
            Time proposal pending — {session.proposed_start_time ? formatTime12h(session.proposed_start_time) : ''}
            {session.proposed_end_time ? ` – ${formatTime12h(session.proposed_end_time)}` : ''}
            {' '}(awaiting client approval)
          </p>
        </div>
      )}

      {/* Counter-propose — compact inline */}
      {showCounterPropose && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Date</label>
              <input
                type="date"
                value={rescheduleDate}
                min={minDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className={`w-[140px] px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  clashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="That date doesn't work..."
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleReschedule}
              disabled={loading || !rescheduleDate || !reason.trim() || !!clashWarning || checkingClash}
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : 'Propose'}
            </button>
            <button
              onClick={() => { setShowCounterPropose(false); setReason(''); setClashWarning(''); setRescheduleDate(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
          {checkingClash && (
            <p className="text-[10px] text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {clashWarning && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
              <p className="text-[10px] text-red-600 font-medium">{clashWarning}</p>
            </div>
          )}
        </div>
      )}

      {/* Overdue Completion Prompt — session end time has passed, tradie must confirm */}
      {isOverdue && isTradie && !showReschedule && !showSkip && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-red-200">
          <p className="text-xs font-medium text-red-800 mb-2">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            This visit's scheduled time has passed. Please confirm the job status.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={handleComplete}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Confirming...' : 'Job Completed'}
            </button>
            <button
              onClick={() => { resetForms(); setShowSkip(true); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              Skip / Not Done
            </button>
          </div>
        </div>
      )}

      {/* Overdue — client can confirm completion or flag as not done */}
      {isOverdue && isClient && !showReschedule && !showSkip && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
          <p className="text-xs font-medium text-amber-800 mb-2">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            This visit's scheduled time has passed. Was the job completed?
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={handleComplete}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {loading ? 'Confirming...' : 'Completed'}
            </button>
            <button
              onClick={() => { resetForms(); setShowSkip(true); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              Not Done
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons — for scheduled/extra sessions (clients keep buttons even when overdue) */}
      {isActionable && (!isOverdue || isClient) && !showReschedule && !showSkip && !showChangeTime && (
        <div className="mt-3 flex items-center gap-1.5">
          {isTradie ? (
            <>
              <button
                onClick={handleComplete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                Mark Complete
              </button>
              {/* Actions dropdown */}
              <div className="relative" ref={actionsMenuRef}>
                <button
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showActionsMenu && (
                  <div className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30">
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowSkip(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <SkipForward className="w-3.5 h-3.5 text-gray-400" />
                      Skip This Visit
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowReschedule(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      Change Date
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowChangeTime(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {session.start_time ? 'Edit Time' : 'Set Time'}
                    </button>
                    {session.status !== 'extra' && (
                      <button
                        onClick={() => { setShowActionsMenu(false); resetForms(); setShowExtra(true); }}
                        className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        Add Extra Session
                      </button>
                    )}
                    {session.status === 'extra' && (
                      <button
                        onClick={() => { setShowActionsMenu(false); handleCancelExtra(); }}
                        disabled={loading}
                        className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Cancel Extra
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Client actions dropdown */}
              <div className="relative" ref={actionsMenuRef}>
                <button
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  Actions
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {showActionsMenu && (
                  <div className="absolute left-0 bottom-full mb-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30">
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowReschedule(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      Change Date
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowChangeTime(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {session.start_time ? 'Edit Time' : 'Change Time'}
                    </button>
                    <button
                      onClick={() => { setShowActionsMenu(false); resetForms(); setShowSkip(true); }}
                      className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <SkipForward className="w-3.5 h-3.5 text-gray-400" />
                      Skip This Visit
                    </button>
                    {session.status !== 'extra' && (
                      <button
                        onClick={() => { setShowActionsMenu(false); resetForms(); setShowExtra(true); }}
                        className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-gray-400" />
                        New Request
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reschedule — compact inline */}
      {showReschedule && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Date</label>
              <input
                type="date"
                value={rescheduleDate}
                min={minDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className={`w-[140px] px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  clashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isTradie ? 'Schedule conflict' : 'Not available'}
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleReschedule}
              disabled={loading || !rescheduleDate || !reason.trim() || !!clashWarning || checkingClash}
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : isTradie ? 'Propose' : 'Confirm'}
            </button>
            <button
              onClick={() => { setShowReschedule(false); setReason(''); setClashWarning(''); setRescheduleDate(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
          {checkingClash && (
            <p className="text-[10px] text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {clashWarning && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
              <p className="text-[10px] text-red-600 font-medium">{clashWarning}</p>
            </div>
          )}
        </div>
      )}

      {/* Skip — compact inline */}
      {showSkip && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <label className="text-[10px] font-medium text-gray-400 uppercase flex-shrink-0">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isTradie ? 'Schedule conflict, on leave...' : 'Away, not available...'}
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleSkip}
            disabled={loading || !reason.trim()}
            className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Skipping...' : 'Skip'}
          </button>
          <button
            onClick={() => { setShowSkip(false); setReason(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Change Time — compact inline */}
      {showChangeTime && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase">Start</label>
            <input
              type="time"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              className="w-[110px] px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <span className="text-gray-300 text-xs">–</span>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase">End</label>
            <input
              type="time"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              className="w-[110px] px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleSaveTime}
            disabled={loading || !newStartTime}
            className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setShowChangeTime(false)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Extra Session — compact inline */}
      {showExtra && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Date</label>
              <input
                type="date"
                value={extraDate}
                min={minDate}
                onChange={(e) => setExtraDate(e.target.value)}
                className={`w-[140px] px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  extraClashWarning ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase">Hrs</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="12"
                value={extraHours}
                onChange={(e) => setExtraHours(e.target.value)}
                placeholder="2"
                className="w-[60px] px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase">$</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={extraCost}
                onChange={(e) => setExtraCost(e.target.value)}
                placeholder="0.00"
                className="w-[80px] px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handleAddExtra}
              disabled={loading || !extraDate || !!extraClashWarning || checkingExtraClash}
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowExtra(false); setExtraDate(''); setExtraHours(''); setExtraCost(''); setExtraNotes(''); setExtraClashWarning(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase flex-shrink-0">Notes</label>
            <input
              type="text"
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Optional — e.g., Emergency callout"
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {checkingExtraClash && (
            <p className="text-[10px] text-gray-400 animate-pulse">Checking availability...</p>
          )}
          {extraClashWarning && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
              <p className="text-[10px] text-red-600 font-medium">{extraClashWarning}</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
