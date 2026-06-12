import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, MapPin, Users, Clock, Plus, X, User, Layers, AlertCircle, Filter, RefreshCw, CalendarClock, Trash2, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { supabase } from '../lib/supabase';
import type { AvailabilitySlot } from '../types/database';

/** Format a Date as YYYY-MM-DD in local timezone (avoids UTC shift) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Job {
  id: string;
  description: string;
  status: string;
  scheduled_date: string | null;
  preferred_time_slot: string | null;
  start_time: string | null;
  end_time: string | null;
  time_confirmed: boolean;
  location_address: string | null;
  contact_name: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  is_emergency: boolean;
  project_id: string | null;
  tradie_id: string | null;
}

function formatJobTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const mm = parts[1] ?? '00';
  if (Number.isNaN(h)) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
}

function timeToMinutes(timeStr: string): number | null {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

const CONFLICT_WINDOW_MINUTES = 60;

// Estimated-duration presets, mirrored from the booking form so a rescheduled job
// can also be placed as a block (start + duration → end).
const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: '4 hours', minutes: 240 },
  { label: 'Half day (5h)', minutes: 300 },
  { label: 'Full day (8h)', minutes: 480 },
];

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = h * 60 + m + minutes;
  const eh = Math.floor((total % (24 * 60)) / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  const diff = e - s;
  return diff > 0 ? diff : null;
}

// Pick a sensible default duration for the reschedule modal. Site visits
// always default to 60 min — they\'re short inspection appointments. For
// other jobs, infer from start/end but clamp out absurd values (legacy bad
// data, or jobs that span a whole availability window rather than a real
// duration). Anything outside the dropdown\'s 60–480 range snaps to 120.
function inferRescheduleDuration(job: { id: string; start_time: string | null; end_time: string | null }): number {
  const isSiteVisit = job.id.startsWith('sitevisit-');
  if (isSiteVisit) return 60;
  const inferred = minutesBetween(job.start_time, job.end_time);
  if (inferred === null) return 120;
  if (inferred < 60 || inferred > 480) return 120;
  return inferred;
}

// Map an exact "HH:MM" time onto the coarse slot used for calendar grouping/colour,
// so a job rescheduled to a specific time still lands in a sensible slot bucket.
function deriveSlotFromTime(timeStr: string): string {
  const mins = timeToMinutes(timeStr);
  if (mins === null) return 'morning';
  if (mins < 12 * 60) return 'morning';
  if (mins < 13 * 60) return 'midday';
  return 'afternoon';
}

// Short, human title for a job from its "[Tag] description" convention.
function jobShortTitle(job: { description?: string | null }): string {
  const desc = job.description ?? '';
  const m = desc.match(/^\[([^\]]+)\]\s*(.*)$/);
  const tag = m?.[1]?.trim();
  const rest = (m?.[2] ?? desc).replace(/^\s*\d+[).\s-]+/, '').split('\n')[0].trim();
  const text = rest.length > 0 ? rest : (tag ?? 'a job');
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

function jobsConflict(a: Job, b: Job): boolean {
  if (a.start_time && b.start_time) {
    const aMin = timeToMinutes(a.start_time);
    const bMin = timeToMinutes(b.start_time);
    if (aMin !== null && bMin !== null) {
      return Math.abs(aMin - bMin) < CONFLICT_WINDOW_MINUTES;
    }
  }
  return !!(a.preferred_time_slot && b.preferred_time_slot && a.preferred_time_slot === b.preferred_time_slot);
}

interface TeamMember {
  id: string;
  invite_name: string;
  role: string;
  trade_specialty: string;
  status: string;
}

interface JobAssignment {
  id: string;
  job_id: string;
  team_member_id: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  role_on_job: string;
  status: string;
}

interface CalendarEntry {
  job: Job;
  assignments: (JobAssignment & { member: TeamMember })[];
  conflictWarning?: boolean;
  conflictsWith?: string[];
}

const TIME_SLOT_COLORS: Record<string, string> = {
  morning: 'bg-warm-50 border-warm-200 text-warm-800',
  midday: 'bg-secondary-50 border-secondary-200 text-secondary-800',
  afternoon: 'bg-warm-50 border-warm-200 text-warm-800',
  evening: 'bg-primary-50 border-primary-200 text-navy-700',
};

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function parseJobDescription(description: string): { category: string; title: string } {
  const match = description.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (match) {
    return { category: match[1], title: match[2] || match[1] };
  }
  return { category: '', title: description };
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  accepted: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  declined: 'bg-red-100 text-red-700 border-red-200',
};

interface AssignTeamModalProps {
  job: Job;
  teamMembers: TeamMember[];
  existingAssignments: JobAssignment[];
  onClose: () => void;
  onSave: (jobId: string, memberId: string, data: Partial<JobAssignment>) => Promise<void>;
  onRemove: (assignmentId: string) => Promise<void>;
}

function AssignTeamModal({ job, teamMembers, existingAssignments, onClose, onSave, onRemove }: AssignTeamModalProps) {
  const [selectedMember, setSelectedMember] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [roleOnJob, setRoleOnJob] = useState('assistant');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const assignedMemberIds = existingAssignments.map(a => a.team_member_id);
  const availableMembers = teamMembers.filter(m => m.status === 'active' && !assignedMemberIds.includes(m.id));

  const handleAdd = async () => {
    if (!selectedMember) { setError('Select a team member'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(job.id, selectedMember, {
        start_time: startTime || null,
        end_time: endTime || null,
        role_on_job: roleOnJob,
        scheduled_date: job.scheduled_date,
      });
      setSelectedMember('');
      setStartTime('');
      setEndTime('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 ">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign Team</h2>
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{job.description}</p>
            {job.location_address && (
              <p className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                <MapPin className="w-3 h-3" />{job.location_address}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {existingAssignments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Assigned ({existingAssignments.length})</h3>
              <div className="space-y-2">
                {existingAssignments.map(assignment => {
                  const member = teamMembers.find(m => m.id === assignment.team_member_id);
                  if (!member) return null;
                  return (
                    <div key={assignment.id} className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary-700">{member.invite_name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{member.invite_name}</p>
                        <p className="text-xs text-gray-500">{member.trade_specialty || member.role} · {assignment.role_on_job}</p>
                        {assignment.start_time && (
                          <p className="text-xs text-gray-400">{assignment.start_time} – {assignment.end_time || '?'}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onRemove(assignment.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Team Member</h3>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">
                <AlertCircle className="w-4 h-4" />{error}
              </div>
            )}

            {availableMembers.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">All active team members are already assigned</p>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedMember}
                  onChange={e => setSelectedMember(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm"
                >
                  <option value="">Select team member...</option>
                  {availableMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.invite_name} ({m.trade_specialty || m.role})</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Role on this job</label>
                  <select value={roleOnJob} onChange={e => setRoleOnJob(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none bg-white">
                    <option value="lead">Lead</option>
                    <option value="assistant">Assistant</option>
                    <option value="apprentice">Apprentice</option>
                    <option value="subcontractor">Subcontractor</option>
                  </select>
                </div>

                <button
                  onClick={handleAdd}
                  disabled={saving || !selectedMember}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 disabled:opacity-50 transition-colors text-sm"
                >
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                  Assign to Job
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SiteCalendar({ embedded = false, defaultCollapsed = false }: { embedded?: boolean; defaultCollapsed?: boolean }) {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const isTradie = profile?.role === 'tradie';
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [filterMember, setFilterMember] = useState<string>('all');
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());
  const [conflictMenuJob, setConflictMenuJob] = useState<string | null>(null);
  const [rescheduleJob, setRescheduleJob] = useState<Job | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState(120);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [removeConfirmJob, setRemoveConfirmJob] = useState<Job | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  // Bump to force a refetch even when currentDate doesn't change (e.g. moving
  // a job within the same week). Avoids the closure-stale fetch race.
  const [refreshTick, setRefreshTick] = useState(0);
  // Single-service clients (see Schedule.tsx) get the calendar collapsed to a
  // compact "next visit" bar until they tap "View calendar".
  const [calendarCollapsed, setCalendarCollapsed] = useState(defaultCollapsed);

  // Close conflict menu when clicking outside
  useEffect(() => {
    if (!conflictMenuJob) return;
    const handleClick = () => setConflictMenuJob(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [conflictMenuJob]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentDate, view, refreshTick]);

  const getDateRange = () => {
    if (view === 'week') {
      const start = new Date(currentDate);
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { start, end } = getDateRange();
    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);

    // Role-aware: tradies see jobs they're assigned to; clients see jobs they posted
    const jobsQuery = supabase
      .from('jobs')
      .select('id, description, status, scheduled_date, preferred_time_slot, start_time, end_time, time_confirmed, location_address, contact_name, budget_amount, budget_type, is_emergency, project_id, tradie_id')
      .not('status', 'in', '(cancelled,declined)')
      .or(`scheduled_date.gte.${startStr},scheduled_date.lte.${endStr}`)
      .order('scheduled_date', { ascending: true });

    if (isTradie) {
      jobsQuery.eq('tradie_id', user.id);
    } else {
      jobsQuery.eq('client_id', user.id);
    }

    const [jobsRes, membersRes, assignmentsRes, slotsRes] = await Promise.all([
      jobsQuery,

      isTradie
        ? supabase
            .from('business_team_members')
            .select('id, invite_name, role, trade_specialty, status')
            .eq('business_owner_id', user.id)
            .eq('status', 'active')
        : Promise.resolve({ data: [] as TeamMember[], error: null }),

      isTradie
        ? supabase
            .from('job_team_assignments')
            .select('*')
            .eq('business_owner_id', user.id)
            .gte('scheduled_date', startStr)
            .lte('scheduled_date', endStr)
        : Promise.resolve({ data: [] as JobAssignment[], error: null }),

      isTradie
        ? supabase
            .from('availability_slots')
            .select('*')
            .eq('tradie_id', user.id)
            .gte('start_time', start.toISOString())
            .lte('start_time', end.toISOString())
        : Promise.resolve({ data: [] as AvailabilitySlot[], error: null }),
    ]);

    // Fetch recurring sessions and convert to pseudo-jobs for the calendar
    const { data: recurringSessions } = await supabase
      .from('recurring_sessions')
      .select('id, scheduled_date, start_time, status, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(tradie_id, client_id, trade_category, service_subtype, description, location, preferred_time)')
      .in('status', ['pending_confirmation', 'scheduled', 'completed'])
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr);

    // Filter sessions to the current user (tradie_id or client_id)
    const myRecurringSessions = (recurringSessions || []).filter((s) => {
      const rj = s.recurring_job as { tradie_id: string | null; client_id: string | null } | null;
      return isTradie ? rj?.tradie_id === user.id : rj?.client_id === user.id;
    });
    const recurringPseudoJobs: Job[] = myRecurringSessions.map((s) => {
      const rj = s.recurring_job as { tradie_id: string | null; trade_category: string; service_subtype: string | null; description: string | null; location: string | null; preferred_time: string | null } | null;
      // Per-session start_time wins (it's the override the user sets via the time
      // chips); fall back to the parent recurring_job's preferred_time.
      const sessionStart = (s as { start_time: string | null }).start_time;
      const timeStr = sessionStart ?? rj?.preferred_time;
      const slot = timeStr ? (
        parseInt(timeStr.split(':')[0]) < 12 ? 'morning' :
        parseInt(timeStr.split(':')[0]) < 14 ? 'midday' :
        parseInt(timeStr.split(':')[0]) < 17 ? 'afternoon' : 'evening'
      ) : null;
      return {
        id: `recurring-${s.id}`,
        description: `[${(rj?.service_subtype || rj?.trade_category || 'Ongoing').toUpperCase()}] ${rj?.description?.split('\n')[0] || 'Ongoing service'}`,
        status: s.status === 'completed' ? 'completed' : s.status === 'pending_confirmation' ? 'pending' : 'accepted',
        scheduled_date: s.scheduled_date,
        preferred_time_slot: slot,
        start_time: timeStr || null,
        end_time: (s as { end_time?: string | null }).end_time ?? null,
        time_confirmed: true,
        location_address: rj?.location || null,
        contact_name: null,
        budget_amount: null,
        budget_type: null,
        is_emergency: false,
        project_id: null,
        tradie_id: user.id,
      };
    });

    const oneOffJobs: Job[] = (jobsRes.data || []).map((j) => ({
      ...j,
      start_time: (j as { start_time?: string | null }).start_time ?? null,
      end_time: (j as { end_time?: string | null }).end_time ?? null,
      time_confirmed: (j as { time_confirmed?: boolean }).time_confirmed ?? false,
    }));

    // Call-out-fee site visits live on quotes; surface them as their own calendar
    // blocks for both the client and the visiting tradie. site_visit_scheduled_at is
    // a full timestamp — split it into a local date + HH:MM for the calendar.
    const visitQuery = supabase
      .from('quotes')
      .select('id, tradie_id, status, site_visit_scheduled_at, site_visit_ends_at, site_visit_time_confirmed, job:jobs!inner(client_id, title, description, location_address)')
      .eq('status', 'site_visit_scheduled')
      .gte('site_visit_scheduled_at', start.toISOString())
      .lte('site_visit_scheduled_at', end.toISOString());
    if (isTradie) visitQuery.eq('tradie_id', user.id);
    else visitQuery.eq('job.client_id', user.id);
    const { data: visitRows } = await visitQuery;

    const toHM = (dt: Date) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const siteVisitJobs: Job[] = (visitRows || [])
      .filter((v) => (v as { site_visit_scheduled_at: string | null }).site_visit_scheduled_at)
      .map((v) => {
        const jb = v.job as { title: string | null; description: string | null; location_address: string | null } | null;
        const d = new Date((v as { site_visit_scheduled_at: string }).site_visit_scheduled_at);
        const endIso = (v as { site_visit_ends_at: string | null }).site_visit_ends_at;
        const titleText = jb?.title || jobShortTitle({ description: jb?.description });
        return {
          id: `sitevisit-${v.id}`,
          description: `[SITE VISIT] ${titleText}`,
          status: 'accepted',
          scheduled_date: toLocalDateStr(d),
          preferred_time_slot: deriveSlotFromTime(toHM(d)),
          start_time: toHM(d),
          end_time: endIso ? toHM(new Date(endIso)) : null,
          time_confirmed: !!(v as { site_visit_time_confirmed?: boolean }).site_visit_time_confirmed,
          location_address: jb?.location_address || null,
          contact_name: null,
          budget_amount: null,
          budget_type: null,
          is_emergency: false,
          project_id: null,
          tradie_id: v.tradie_id,
        };
      });

    setJobs([...oneOffJobs, ...recurringPseudoJobs, ...siteVisitJobs]);
    setTeamMembers(membersRes.data || []);
    setAssignments((assignmentsRes.data as JobAssignment[]) || []);
    setAvailabilitySlots((slotsRes.data || []) as AvailabilitySlot[]);

    // Persisted "Ignore conflict" choices, so a dismissed conflict pair does not
    // reappear on reload. Only the client side surfaces conflicts.
    if (!isTradie) {
      const { data: dismissals } = await supabase
        .from('conflict_dismissals')
        .select('pair_key')
        .eq('user_id', user.id);
      setDismissedConflicts(new Set((dismissals || []).map((d) => d.pair_key as string)));
    }

    setLoading(false);
  };

  const handleAssign = async (jobId: string, memberId: string, data: Partial<JobAssignment>) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('job_team_assignments').insert({
        job_id: jobId,
        team_member_id: memberId,
        scheduled_date: data.scheduled_date || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        role_on_job: data.role_on_job || '',
        status: 'scheduled' as const,
      });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      console.error('Failed to assign team member to job:', err);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase.from('job_team_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    } catch (err) {
      console.error('Failed to remove assignment:', err);
    }
  };

  // Persist a one-time "Ignore" of a conflict so it doesn't nag on reload. The
  // client must actively dismiss; it never re-surfaces unless a *new* conflict pair
  // forms (different job ids). Optimistic local update + best-effort persistence.
  const dismissConflict = async (jobId: string, conflictsWith: string[] = []) => {
    if (!user || conflictsWith.length === 0) return;
    const pairKeys = conflictsWith.map((other) => [jobId, other].sort().join('|'));
    setDismissedConflicts((prev) => {
      const next = new Set(prev);
      pairKeys.forEach((k) => next.add(k));
      return next;
    });
    setConflictMenuJob(null);
    try {
      await supabase
        .from('conflict_dismissals')
        .upsert(pairKeys.map((pk) => ({ user_id: user.id, pair_key: pk })), { onConflict: 'user_id,pair_key' });
    } catch (e) {
      console.warn('Failed to persist conflict dismissal (non-fatal):', e);
    }
  };

  const performReschedule = async (job: Job, newDate: string, newSlot?: string, newTime?: string, newDurationMinutes?: number) => {
    // Site-visit blocks are backed by a quote, not the jobs table. A tradie acting
    // here confirms the window; a client proposes a new one (tradie re-confirms).
    if (job.id.startsWith('sitevisit-')) {
      const quoteId = job.id.replace('sitevisit-', '');
      const startIso = newTime
        ? new Date(`${newDate}T${newTime}`).toISOString()
        : new Date(`${newDate}T09:00`).toISOString();
      const endIso = newTime
        ? new Date(new Date(`${newDate}T${newTime}`).getTime() + (newDurationMinutes ?? 120) * 60000).toISOString()
        : null;
      const { error } = await supabase
        .from('quotes')
        .update({
          site_visit_scheduled_at: startIso,
          site_visit_ends_at: endIso,
          site_visit_time_confirmed: isTradie,
        })
        .eq('id', quoteId);
      if (error) throw error;
      try {
        const whenLabel = new Date(startIso).toLocaleString('en-AU', {
          weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
        });
        if (isTradie) {
          // Pull the underlying job id + client so we can pass p_job_id to the
          // create_notification RPC — it enforces a shared-job relationship
          // between caller and target.
          const { data: qr } = await supabase
            .from('quotes')
            .select('job:jobs!inner(id, client_id)')
            .eq('id', quoteId)
            .maybeSingle();
          const underlyingJob = qr?.job as { id?: string; client_id?: string } | null;
          const clientId = underlyingJob?.client_id;
          const underlyingJobId = underlyingJob?.id;
          if (clientId && underlyingJobId) {
            await supabase.rpc('create_notification', {
              p_user_id: clientId,
              p_title: 'Site visit confirmed',
              p_message: `Your tradie confirmed the site visit for ${whenLabel}.`,
              p_type: 'site_visit_time_confirmed',
              p_channel: 'in_app',
              p_read: false,
              p_link: null,
              p_job_id: underlyingJobId,
              p_metadata: null,
            });
          }
        } else if (job.tradie_id) {
          // Client proposing a new time to the tradie — pass the real job_id
          // so the create_notification RPC sees the shared-job relationship.
          const { data: qr } = await supabase
            .from('quotes')
            .select('job_id')
            .eq('id', quoteId)
            .maybeSingle();
          const underlyingJobId = qr?.job_id;
          if (underlyingJobId) {
            await supabase.rpc('create_notification', {
              p_user_id: job.tradie_id,
              p_title: 'Site visit time to confirm',
              p_message: `The client proposed ${whenLabel} for the site visit. Please confirm or adjust.`,
              p_type: 'site_visit_time_proposed',
              p_channel: 'in_app',
              p_read: false,
              p_link: null,
              p_job_id: underlyingJobId,
              p_metadata: null,
            });
          }
        }
      } catch (e) {
        console.warn('Site-visit reschedule notify failed (non-fatal):', e);
      }
      return;
    }

    const isRecurring = job.id.startsWith('recurring-');
    if (isRecurring) {
      const sessionId = job.id.replace('recurring-', '');
      const { error } = await supabase
        .from('recurring_sessions')
        .update({ scheduled_date: newDate })
        .eq('id', sessionId);
      if (error) throw error;
      return;
    }

    const updateData: Record<string, string | null | boolean> = { scheduled_date: newDate };
    if (newTime) {
      // Exact clock time wins; keep the slot consistent for calendar grouping and
      // recompute the end time as a block (start + duration).
      updateData.start_time = newTime;
      updateData.end_time = addMinutesToTime(newTime, newDurationMinutes ?? 120);
      updateData.preferred_time_slot = newSlot || deriveSlotFromTime(newTime);
    } else {
      // No exact time — clear any previous block and fall back to the slot.
      updateData.start_time = null;
      updateData.end_time = null;
      if (newSlot) updateData.preferred_time_slot = newSlot;
    }
    // A tradie acting here confirms the window; a client is proposing it (awaiting
    // the tradie's confirmation).
    updateData.time_confirmed = isTradie;

    const { error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job.id);
    if (error) throw error;

    await notifyReschedule(
      job,
      newDate,
      updateData.start_time as string | null,
      updateData.end_time as string | null,
      (updateData.preferred_time_slot as string | null) ?? job.preferred_time_slot,
    );
  };

  // Notifications follow the proposal→confirmation model:
  //  • Client proposes/moves a time → the assigned tradie is asked to confirm it,
  //    and the client is alerted if the move clashes with another of their jobs.
  //  • Tradie confirms/adjusts the window → the client is told it's confirmed.
  // Unaffected tradies are never notified.
  const notifyReschedule = async (
    job: Job,
    newDate: string,
    newStart: string | null,
    newEnd: string | null,
    newSlot: string | null,
  ) => {
    try {
      if (!user) return;
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
      const rangeLabel = newStart
        ? (newEnd ? `${formatJobTime(newStart)} – ${formatJobTime(newEnd)}` : formatJobTime(newStart))
        : (newSlot ? (TIME_SLOT_LABELS[newSlot] ?? newSlot) : null);
      const whenLabel = rangeLabel ? `${dateLabel}, ${rangeLabel}` : dateLabel;
      const movedTitle = jobShortTitle(job);

      // Tradie confirmed the window → tell the client it's locked in.
      if (isTradie) {
        const { data: jobRow } = await supabase
          .from('jobs')
          .select('client_id')
          .eq('id', job.id)
          .maybeSingle();
        const clientId = (jobRow as { client_id?: string } | null)?.client_id;
        if (clientId) {
          await supabase.rpc('create_notification', {
            p_user_id: clientId,
            p_title: 'Visit time confirmed',
            p_message: `Your tradie confirmed "${movedTitle}" for ${whenLabel}.`,
            p_type: 'job_time_confirmed',
            p_channel: 'in_app',
            p_read: false,
            p_link: null,
            p_job_id: job.id,
            p_metadata: null,
          });
        }
        return;
      }

      // Client proposed a time → ask the assigned tradie to confirm (if assigned).
      if (job.tradie_id) {
        await supabase.rpc('create_notification', {
          p_user_id: job.tradie_id,
          p_title: 'New time to confirm',
          p_message: `The client proposed ${whenLabel} for "${movedTitle}". Please confirm or adjust the time.`,
          p_type: 'job_time_proposed',
          p_channel: 'in_app',
          p_read: false,
          p_link: null,
          p_job_id: job.id,
          p_metadata: null,
        });
      }

      // Detect a clash with the client's other active jobs on the new date.
      const { data: sameDay } = await supabase
        .from('jobs')
        .select('id, description, scheduled_date, preferred_time_slot, start_time, status, tradie_id')
        .eq('client_id', user.id)
        .eq('scheduled_date', newDate)
        .neq('id', job.id)
        .not('status', 'in', '(completed,cancelled,declined)');

      const movedRep = { ...job, scheduled_date: newDate, start_time: newStart, preferred_time_slot: newSlot } as Job;
      const clashes = (sameDay || []).filter((j) => jobsConflict(movedRep, j as Job));
      if (clashes.length === 0) return;

      // Resolve tradie names so the client alert can name who's involved.
      const tradieIds = [job.tradie_id, ...clashes.map((c) => c.tradie_id)].filter(Boolean) as string[];
      const nameById = new Map<string, string>();
      if (tradieIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', tradieIds);
        (profiles || []).forEach((p) => nameById.set(p.id, p.full_name));
      }
      const withTradie = (title: string, tradieId: string | null) =>
        tradieId && nameById.get(tradieId) ? `${title} (${nameById.get(tradieId)})` : title;

      const other = clashes[0];
      await supabase.rpc('create_notification', {
        p_user_id: user.id,
        p_title: 'Scheduling conflict',
        p_message:
          `Heads up — ${withTradie(movedTitle, job.tradie_id)} and ` +
          `${withTradie(jobShortTitle(other), other.tradie_id)} are now both booked for ${whenLabel}. ` +
          `You can reschedule one of them to a different time from your calendar.`,
        p_type: 'schedule_conflict',
        p_channel: 'in_app',
        p_read: false,
        p_link: null,
        p_job_id: job.id,
        p_metadata: null,
      });
    } catch (e) {
      console.warn('Reschedule notifications failed (non-fatal):', e);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleJob || !rescheduleDate) return;
    setRescheduleSaving(true);
    try {
      await performReschedule(rescheduleJob, rescheduleDate, rescheduleSlot, rescheduleTime, rescheduleDuration);
      const newDate = rescheduleDate;
      setRescheduleJob(null);
      setRescheduleDate('');
      setRescheduleSlot('');
      setRescheduleTime('');
      setRescheduleDuration(120);
      setConflictMenuJob(null);
      // Move viewport + bump refreshTick so useEffect runs the fetch with the
      // updated currentDate (avoids the closure-stale race we hit before).
      setCurrentDate(new Date(newDate + 'T00:00:00'));
      setRefreshTick(t => t + 1);
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      showToast(`Rescheduled to ${dateLabel}`);
    } catch (err) {
      console.error('Failed to reschedule:', err);
      showToast('Failed to reschedule. Please try again.', true);
    } finally {
      setRescheduleSaving(false);
    }
  };

  // One-click slot change from inside the detail popover. Works for both one-off
  // jobs (writes preferred_time_slot) and recurring sessions (writes start_time
  // to a canonical time within the chosen slot — the slot label is derived from
  // start_time elsewhere, so the chip will reflect the change after refresh).
  const SLOT_CANONICAL_TIME: Record<string, string> = {
    morning: '09:00:00',
    midday: '12:00:00',
    afternoon: '14:00:00',
    evening: '18:00:00',
  };
  const [slotSaving, setSlotSaving] = useState<string | null>(null);
  // Pending slot preview — clicking a chip stages the change but doesn't save
  // until the user clicks Confirm. Prevents accidental slot changes.
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  // Reset the staged slot whenever the popover opens for a different job (or closes).
  useEffect(() => {
    setPendingSlot(null);
  }, [selectedJob?.id]);
  const quickChangeSlot = async (job: Job, newSlot: string) => {
    setSlotSaving(newSlot);
    try {
      if (job.id.startsWith('recurring-')) {
        const sessionId = job.id.replace('recurring-', '');
        const startTime = SLOT_CANONICAL_TIME[newSlot];
        if (!startTime) throw new Error(`Unknown slot: ${newSlot}`);
        const { error } = await supabase
          .from('recurring_sessions')
          .update({ start_time: startTime })
          .eq('id', sessionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('jobs')
          .update({ preferred_time_slot: newSlot })
          .eq('id', job.id);
        if (error) throw error;
      }
      setSelectedJob(prev => prev && prev.id === job.id ? { ...prev, preferred_time_slot: newSlot } : prev);
      await fetchData();
      // Build a context-aware toast so the user can see exactly which session
      // moved (helpful when multiple jobs are scheduled on the same day).
      const slotLabel = TIME_SLOT_LABELS[newSlot] ?? newSlot;
      const bracketMatch = job.description.match(/^\[([^\]]+)\]/);
      const tag = bracketMatch?.[1]?.trim();
      const suburb = job.location_address?.split(',')[0]?.trim();
      const dateLabel = job.scheduled_date
        ? new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        : null;
      const ctx = [tag, suburb].filter(Boolean).join(' · ');
      const datePart = dateLabel ? ` on ${dateLabel}` : '';
      showToast(ctx ? `${ctx} → ${slotLabel}${datePart}` : `Time slot changed to ${slotLabel}`);
    } catch (err) {
      console.error('Slot change failed:', err);
      showToast('Failed to change time slot. Please try again.', true);
    } finally {
      setSlotSaving(null);
    }
  };

  // One-click reschedule from inside the detail popover. Used by the quick-pick
  // chips so the client doesn't have to open a second modal for the common case.
  // After save we (a) toast confirmation, (b) jump the calendar to the week/month
  // containing the new date so the moved job is visible immediately.
  const [quickRescheduling, setQuickRescheduling] = useState<string | null>(null);
  const quickReschedule = async (job: Job, newDate: string) => {
    setQuickRescheduling(newDate);
    try {
      await performReschedule(job, newDate);
      setSelectedJob(null);
      // Move viewport + bump refreshTick so useEffect runs the fetch with the
      // updated currentDate (avoids the closure-stale race).
      setCurrentDate(new Date(newDate + 'T00:00:00'));
      setRefreshTick(t => t + 1);
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      showToast(`Rescheduled to ${dateLabel}`);
    } catch (err) {
      console.error('Quick reschedule failed:', err);
      showToast('Failed to reschedule. Please try again.', true);
    } finally {
      setQuickRescheduling(null);
    }
  };

  const handleRemoveJob = async () => {
    if (!removeConfirmJob) return;
    setRemoveSaving(true);
    try {
      const isRecurring = removeConfirmJob.id.startsWith('recurring-');
      if (isRecurring) {
        const sessionId = removeConfirmJob.id.replace('recurring-', '');
        const { error } = await supabase
          .from('recurring_sessions')
          .update({ status: 'cancelled' })
          .eq('id', sessionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('jobs')
          .update({ status: 'cancelled' })
          .eq('id', removeConfirmJob.id);
        if (error) throw error;
      }
      setRemoveConfirmJob(null);
      setConflictMenuJob(null);
      if (selectedJob?.id === removeConfirmJob.id) setSelectedJob(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to remove job:', err);
    } finally {
      setRemoveSaving(false);
    }
  };

  const getWeekDays = () => {
    const { start } = getDateRange();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const days: (Date | null)[] = Array(startPad).fill(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const getJobsForDate = (date: Date): CalendarEntry[] => {
    const dateStr = toLocalDateStr(date);
    const dayJobs = jobs.filter(j => j.scheduled_date === dateStr);

    const entriesForDate = dayJobs.map(job => {
      const jobAssignments = assignments
        .filter(a => a.job_id === job.id)
        .map(a => ({
          ...a,
          member: teamMembers.find(m => m.id === a.team_member_id) as TeamMember,
        }))
        .filter(a => a.member);

      // Only flag conflicts for non-completed active jobs with overlapping times.
      // Prefers exact start_time overlap (within ±60min); falls back to slot equality
      // when one or both jobs only have a slot label (e.g. one-off jobs).
      const isCompleted = job.status === 'completed';
      const timeSlotOverlaps = isCompleted ? [] : dayJobs.filter(
        j => j.id !== job.id && j.status !== 'completed' && jobsConflict(job, j)
      );

      // Check if this conflict pair has been dismissed
      const isDismissed = timeSlotOverlaps.length > 0 && timeSlotOverlaps.every(j => {
        const pairKey = [job.id, j.id].sort().join('|');
        return dismissedConflicts.has(pairKey);
      });

      return {
        job,
        assignments: jobAssignments,
        conflictWarning: timeSlotOverlaps.length > 0 && !isDismissed,
        conflictsWith: timeSlotOverlaps.map(j => j.id),
      };
    });

    if (filterMember !== 'all') {
      return entriesForDate.filter(entry =>
        entry.assignments.some(a => a.team_member_id === filterMember) ||
        entry.job.tradie_id === user?.id
      );
    }

    if (showOnlyConflicts) {
      return entriesForDate.filter(e => e.conflictWarning);
    }

    return entriesForDate;
  };

  const getAvailabilityForDate = (date: Date): AvailabilitySlot[] => {
    const dateStr = toLocalDateStr(date);
    return availabilitySlots.filter(slot => {
      const slotDate = toLocalDateStr(new Date(slot.start_time));
      return slotDate === dateStr;
    });
  };

  const formatSlotTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const getTitle = () => {
    if (view === 'week') {
      const { start, end } = getDateRange();
      return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const activeJobs = jobs.filter(j => j.status !== 'completed');
  const conflictCount = activeJobs.filter(j => {
    const sameDateJobs = activeJobs.filter(j2 => j2.id !== j.id && j2.scheduled_date === j.scheduled_date);
    const overlapping = sameDateJobs.filter(j2 => jobsConflict(j, j2));
    // Exclude dismissed conflicts
    return overlapping.some(j2 => {
      const pairKey = [j.id, j2.id].sort().join('|');
      return !dismissedConflicts.has(pairKey);
    });
  }).length;

  const selectedJobAssignments = selectedJob
    ? assignments.filter(a => a.job_id === selectedJob.id)
    : [];

  const days = view === 'week' ? getWeekDays() : [];
  const monthDays = view === 'month' ? getMonthDays() : [];

  const content = (
    <>
      <div className="space-y-5 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Site Calendar</h1>
            <p className="text-gray-500 mt-1">Track jobs, team assignments, and your availability in one view</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {conflictCount > 0 && (
              <button
                onClick={() => setShowOnlyConflicts(!showOnlyConflicts)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  showOnlyConflicts
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                {conflictCount} Conflict{conflictCount > 1 ? 's' : ''}
              </button>
            )}

            {teamMembers.length > 0 && (
              <div className="relative">
                <select
                  value={filterMember}
                  onChange={e => setFilterMember(e.target.value)}
                  className="pl-8 pr-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none appearance-none"
                >
                  <option value="all">All Team</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.invite_name}</option>)}
                </select>
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}

            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setView('week')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'week' ? 'bg-warm-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >Week</button>
              <button
                onClick={() => setView('month')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'month' ? 'bg-warm-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >Month</button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h2 className="font-semibold text-gray-900">{getTitle()}</h2>
              <button onClick={() => setCurrentDate(new Date())} className="text-xs text-primary-600 font-medium hover:underline">Today</button>
            </div>
            <button onClick={() => navigate(1)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : view === 'week' ? (
            <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[500px]">
              {days.map((day, i) => {
                const entries = getJobsForDate(day);
                const today = isToday(day);
                const daySlots = getAvailabilityForDate(day);
                const hasAvailable = daySlots.some(s => s.status === 'available');
                const now = new Date();
                const isPastDay = day < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return (
                  <div key={i} className={`flex flex-col ${isPastDay ? 'opacity-60' : ''} ${today ? 'bg-primary-50/30' : hasAvailable ? 'bg-green-50/40' : ''}`}>
                    <div className={`px-2 py-3 text-center border-b border-gray-100 ${today ? 'bg-primary-50' : ''}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{day.toLocaleDateString('en-AU', { weekday: 'short' })}</p>
                      <p className={`text-lg font-bold mt-0.5 ${today ? 'text-primary-600' : isPastDay ? 'text-gray-400' : 'text-gray-900'}`}>{day.getDate()}</p>
                      {daySlots.length > 0 && (
                        <div className="flex justify-center gap-0.5 mt-1">
                          {daySlots.map(slot => (
                            <span
                              key={slot.id}
                              title={`${formatSlotTime(slot.start_time)} – ${formatSlotTime(slot.end_time)} (${slot.status})`}
                              className={`w-1.5 h-1.5 rounded-full ${
                                slot.status === 'available' ? 'bg-green-500' : 'bg-red-400'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[600px]">
                      {entries.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-xs text-gray-300 py-4">{hasAvailable ? 'Available' : 'No jobs'}</p>
                        </div>
                      ) : (
                        entries.map(({ job, assignments: jobAssignments, conflictWarning, conflictsWith }) => {
                          const { category, title } = parseJobDescription(job.description);
                          return (
                            <div
                              key={job.id}
                              onClick={() => setSelectedJob(job)}
                              className={`relative p-2.5 rounded-lg border cursor-pointer hover:shadow-md transition-all text-xs ${
                                job.is_emergency
                                  ? 'bg-red-50 border-red-200'
                                  : conflictWarning
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-white border-gray-200 hover:border-primary-300'
                              }`}
                            >
                              {/* Header: category badge + status */}
                              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                {category && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700 font-semibold text-[10px] uppercase tracking-wide">
                                    {category}
                                  </span>
                                )}
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                  {job.status.replace('_', ' ')}
                                </span>
                                {job.is_emergency && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-semibold">
                                    Urgent
                                  </span>
                                )}
                                {conflictWarning && (
                                  <div className="ml-auto flex-shrink-0 relative">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConflictMenuJob(conflictMenuJob === job.id ? null : job.id);
                                      }}
                                      title="Resolve conflict"
                                      className="p-0.5 rounded hover:bg-red-100 transition-colors"
                                    >
                                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                    </button>
                                    {conflictMenuJob === job.id && (
                                      <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRescheduleJob(job);
                                            setRescheduleDate(job.scheduled_date || '');
                                            setRescheduleSlot(job.preferred_time_slot || '');
                                            setRescheduleTime(job.start_time || '');
                                            setRescheduleDuration(inferRescheduleDuration(job));
                                            setConflictMenuJob(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                          <CalendarClock className="w-3.5 h-3.5 text-primary-500" />
                                          Reschedule
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRemoveConfirmJob(job);
                                            setConflictMenuJob(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          Remove Job
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            dismissConflict(job.id, conflictsWith);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                        >
                                          <Check className="w-3.5 h-3.5 text-gray-400" />
                                          Ignore conflict
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Identity fallback — only when there's no category
                                  badge to name the card (badge is the title otherwise). */}
                              {!category && (
                                <p className="font-semibold text-gray-900 line-clamp-1 leading-snug">{title}</p>
                              )}

                              {/* Details: time · location on one row. The full task
                                  list / address opens in the click-through popup. */}
                              {(job.start_time || job.preferred_time_slot || job.location_address) && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-gray-500">
                                  {(job.start_time || job.preferred_time_slot) && (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 flex-shrink-0 text-gray-400" />
                                      {job.start_time
                                        ? (job.end_time
                                            ? `${formatJobTime(job.start_time)} – ${formatJobTime(job.end_time)}`
                                            : formatJobTime(job.start_time))
                                        : (job.preferred_time_slot ? (TIME_SLOT_LABELS[job.preferred_time_slot] || job.preferred_time_slot) : '')}
                                    </span>
                                  )}
                                  {job.start_time && !job.time_confirmed && !job.id.startsWith('recurring-') && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium leading-none">proposed</span>
                                  )}
                                  {(job.start_time || job.preferred_time_slot) && job.location_address && (
                                    <span className="text-gray-300">·</span>
                                  )}
                                  {job.location_address && (
                                    <span className="inline-flex items-center gap-1 min-w-0">
                                      <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-gray-400" />
                                      <span className="truncate">{job.location_address.split(',')[0]}</span>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Team avatars */}
                              {jobAssignments.length > 0 && (
                                <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-gray-100">
                                  <Users className="w-2.5 h-2.5 text-primary-500" />
                                  <div className="flex -space-x-1">
                                    {jobAssignments.slice(0, 3).map(a => (
                                      <div key={a.id} title={a.member?.invite_name}
                                        className="w-4 h-4 rounded-full bg-primary-200 border border-white flex items-center justify-center">
                                        <span className="text-[8px] font-bold text-primary-700">
                                          {a.member?.invite_name.charAt(0)}
                                        </span>
                                      </div>
                                    ))}
                                    {jobAssignments.length > 3 && (
                                      <div className="w-4 h-4 rounded-full bg-gray-200 border border-white flex items-center justify-center">
                                        <span className="text-[8px] font-bold text-gray-600">+{jobAssignments.length - 3}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 border-b border-gray-100">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} className="py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
                {monthDays.map((day, i) => {
                  if (!day) return <div key={i} className="min-h-[100px] bg-gray-50/50" />;
                  const entries = getJobsForDate(day);
                  const today = isToday(day);
                  const daySlots = getAvailabilityForDate(day);
                  const hasAvailable = daySlots.some(s => s.status === 'available');
                  const now = new Date();
                  const isPastDay = day < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  return (
                    <div key={i} className={`min-h-[100px] p-2 ${isPastDay ? 'opacity-60' : ''} ${today ? 'bg-primary-50/30' : hasAvailable ? 'bg-green-50/40 hover:bg-green-50/60' : 'hover:bg-gray-50/50'} transition-colors`}>
                      <div className="flex items-center gap-1 mb-1.5">
                        <p className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                          today ? 'bg-warm-500 text-white' : isPastDay ? 'text-gray-400' : 'text-gray-700'
                        }`}>
                          {day.getDate()}
                        </p>
                        {hasAvailable && (
                          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Available" />
                        )}
                      </div>
                      <div className="space-y-1">
                        {entries.slice(0, 3).map(({ job, conflictWarning }) => (
                          <div
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className={`px-2 py-1 rounded text-xs cursor-pointer truncate border font-medium transition-colors ${
                              job.is_emergency
                                ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                                : conflictWarning
                                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                : STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {job.description}
                          </div>
                        ))}
                        {entries.length > 3 && (
                          <p className="text-xs text-gray-400 pl-1">+{entries.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-3">
          <div className="flex items-center gap-5 text-xs text-gray-600">
            <span className="font-medium text-gray-700">Legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-warm-50 border border-warm-200" />
              Scheduled job
            </span>
            {conflictCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-200" />
                Conflict
              </span>
            )}
          </div>
          <Link
            to="/dashboard"
            className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
          >
            Edit availability on Dashboard &rarr;
          </Link>
        </div>

        {jobs.length === 0 && !loading && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-12 text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-primary-400" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-2">No jobs scheduled this period</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Jobs with a scheduled date will appear on the calendar. Accept and schedule jobs to see them here.
            </p>
          </div>
        )}

        {teamMembers.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" />
              Team Activity This Period
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {teamMembers.map(member => {
                const memberAssignments = assignments.filter(a => a.team_member_id === member.id);
                return (
                  <div key={member.id} className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterMember === member.id
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`} onClick={() => setFilterMember(filterMember === member.id ? 'all' : member.id)}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary-700">{member.invite_name.charAt(0)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.invite_name}</p>
                        <p className="text-xs text-gray-400 truncate">{member.trade_specialty || member.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-600">
                        {memberAssignments.length} job{memberAssignments.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedJob && (() => {
        // Pull the bracketed service tag out and clean up the description so the
        // header reads as "OFFICE CLEAN" + "Wipe down all desks…" instead of
        // "[OFFICE CLEAN] 1. Wipe down all desks…".
        const bracketMatch = selectedJob.description.match(/^\[([^\]]+)\]\s*(.*)/s);
        const serviceTag = bracketMatch?.[1]?.trim() || null;
        const restDescription = (bracketMatch?.[2] || selectedJob.description).trim();
        // Strip any leading "1. " / "(1) " numbering, then if more numbered items
        // follow inline, take only up to the next one.
        const stripped = restDescription.replace(/^\s*\d+[).\s-]+/, '').trim();
        const nextItem = stripped.match(/^(.+?)\s+\d+[).\s-]+/);
        const firstLine = (nextItem ? nextItem[1] : stripped.split('\n')[0]).trim();
        const headerTitle = firstLine.length > 0
          ? (firstLine.length > 90 ? firstLine.slice(0, 90) + '…' : firstLine)
          : (serviceTag ?? 'Job');
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 ">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[selectedJob.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {selectedJob.status.replace('_', ' ')}
                  </span>
                  {serviceTag && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-secondary-50 text-secondary-700 border border-secondary-200">
                      {serviceTag}
                    </span>
                  )}
                  {selectedJob.is_emergency && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Emergency</span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">{headerTitle}</h2>
              </div>
              <button onClick={() => setSelectedJob(null)} className="ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {selectedJob.scheduled_date && (
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(selectedJob.scheduled_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {/* Quick reschedule chips */}
                {selectedJob.status !== 'completed' && (() => {
                  const anchorStr = selectedJob.scheduled_date ?? toLocalDateStr(new Date());
                  const anchor = new Date(anchorStr + 'T00:00:00');
                  const addDays = (n: number) => {
                    const d = new Date(anchor);
                    d.setDate(d.getDate() + n);
                    return toLocalDateStr(d);
                  };
                  const tomorrowDate = (() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    return toLocalDateStr(d);
                  })();
                  const chips: { label: string; value: string }[] = [
                    { label: '+1 week', value: addDays(7) },
                    { label: '+2 weeks', value: addDays(14) },
                    { label: 'Tomorrow', value: tomorrowDate },
                  ];
                  return (
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{isTradie ? 'Confirm or adjust time' : 'Quick reschedule'}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {chips.map(c => {
                          const saving = quickRescheduling === c.value;
                          return (
                            <button
                              key={c.label}
                              type="button"
                              disabled={saving}
                              onClick={() => quickReschedule(selectedJob, c.value)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              {saving && <span className="w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />}
                              {c.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleJob(selectedJob);
                            setRescheduleDate(selectedJob.scheduled_date || '');
                            setRescheduleSlot(selectedJob.preferred_time_slot || '');
                            setRescheduleTime(selectedJob.start_time || '');
                            setRescheduleDuration(inferRescheduleDuration(selectedJob));
                            setSelectedJob(null);
                          }}
                          className="inline-flex items-center px-2.5 py-1 rounded-full border border-dashed border-gray-300 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          {isTradie ? 'Set exact time…' : 'Pick date…'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {/* Time slot chips — clicking stages a change; user must Confirm to save. */}
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-baseline justify-between mb-2 gap-2">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Time</p>
                    {selectedJob.id.startsWith('recurring-') && (
                      <p className="text-[10px] text-gray-400">Changes only this session</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['morning', 'midday', 'afternoon', 'evening'] as const).map(slot => {
                      const isCurrent = selectedJob.preferred_time_slot === slot;
                      const isPending = pendingSlot === slot;
                      const isStaged = isPending && !isCurrent;
                      const saving = slotSaving === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={saving}
                          onClick={() => setPendingSlot(isPending ? null : slot)}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors disabled:cursor-not-allowed ${
                            isStaged
                              ? 'bg-emerald-500 text-white border-emerald-500'
                              : isCurrent
                                ? `${TIME_SLOT_COLORS[slot] ?? 'bg-emerald-50 border-emerald-200 text-emerald-700'}`
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                          }`}
                        >
                          {saving && <span className="w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />}
                          {TIME_SLOT_LABELS[slot] ?? slot}
                        </button>
                      );
                    })}
                  </div>
                  {/* Confirm bar — only shown when a different slot has been staged. */}
                  {pendingSlot && pendingSlot !== selectedJob.preferred_time_slot && (
                    <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-600">
                        Change to <span className="font-semibold text-gray-900">{TIME_SLOT_LABELS[pendingSlot] ?? pendingSlot}</span>?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingSlot(null)}
                          disabled={slotSaving !== null}
                          className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await quickChangeSlot(selectedJob, pendingSlot);
                            setPendingSlot(null);
                          }}
                          disabled={slotSaving !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                        >
                          {slotSaving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedJob.location_address && (
                <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="text-sm font-medium text-gray-900">{selectedJob.location_address}</p>
                  </div>
                </div>
              )}

              {selectedJob.contact_name && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                  <User className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Client</p>
                    <p className="text-sm font-medium text-gray-900">{selectedJob.contact_name}</p>
                  </div>
                </div>
              )}

              {selectedJobAssignments.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary-600" />
                    Assigned Team ({selectedJobAssignments.length})
                  </p>
                  <div className="space-y-2">
                    {selectedJobAssignments.map(a => {
                      const member = teamMembers.find(m => m.id === a.team_member_id);
                      if (!member) return null;
                      return (
                        <div key={a.id} className="flex items-center gap-3 p-3 bg-primary-50 rounded-xl">
                          <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center">
                            <span className="text-sm font-bold text-primary-700">{member.invite_name.charAt(0)}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{member.invite_name}</p>
                            <p className="text-xs text-gray-500">{a.role_on_job} · {member.trade_specialty || member.role}</p>
                          </div>
                          {a.start_time && (
                            <span className="text-xs text-gray-500">{a.start_time}–{a.end_time || '?'}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conflict resolution actions */}
              {selectedJob.status !== 'completed' && selectedJob.scheduled_date && (() => {
                const sameDateJobs = jobs.filter(
                  j => j.id !== selectedJob.id && j.scheduled_date === selectedJob.scheduled_date &&
                  j.status !== 'completed' && jobsConflict(selectedJob, j)
                );
                if (sameDateJobs.length === 0) return null;
                return (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <p className="text-sm font-medium text-red-800">Time Conflict</p>
                    </div>
                    <p className="text-xs text-red-700 mb-3">
                      This job overlaps with {sameDateJobs.length} other {sameDateJobs.length === 1 ? 'job' : 'jobs'} within an hour.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRescheduleJob(selectedJob);
                          setRescheduleDate(selectedJob.scheduled_date || '');
                          setRescheduleSlot(selectedJob.preferred_time_slot || '');
                          setRescheduleTime(selectedJob.start_time || '');
                          setRescheduleDuration(inferRescheduleDuration(selectedJob));
                          setSelectedJob(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-300 text-red-800 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Reschedule
                      </button>
                      <button
                        onClick={() => {
                          setRemoveConfirmJob(selectedJob);
                          setSelectedJob(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Job
                      </button>
                    </div>
                  </div>
                );
              })()}

              {teamMembers.length > 0 ? (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-primary-300 text-primary-600 font-medium rounded-xl hover:bg-primary-50 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Assign Team Members
                </button>
              ) : profile?.role === 'tradie' ? (
                <p className="text-xs text-gray-400 text-center">
                  Add team members in the <Link to="/work?tab=recruitment" className="text-primary-600 hover:underline">Hiring</Link> tab to assign them to jobs.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Reschedule Modal */}
      {rescheduleJob && (() => {
        // Pull out the bracketed service tag (e.g. "[OFFICE CLEAN]") for the title
        // and use the rest of the description as the body.
        const bracketMatch = rescheduleJob.description.match(/^\[([^\]]+)\]\s*(.*)/s);
        const serviceTag = bracketMatch?.[1]?.trim() || null;
        const restDescription = (bracketMatch?.[2] || rescheduleJob.description).trim();
        // Strip leading "1. " numbering, then if more numbered items follow inline,
        // take only up to the next one.
        const stripped = restDescription.replace(/^\s*\d+[).\s-]+/, '').trim();
        const nextItem = stripped.match(/^(.+?)\s+\d+[).\s-]+/);
        const firstLine = (nextItem ? nextItem[1] : stripped.split('\n')[0]).trim();
        const titleText = firstLine.length > 0
          ? (firstLine.length > 70 ? firstLine.slice(0, 70) + '…' : firstLine)
          : (serviceTag ?? 'Job');

        const currentDateLabel = rescheduleJob.scheduled_date
          ? new Date(rescheduleJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
          : null;
        const currentSlotLabel = rescheduleJob.preferred_time_slot
          ? (TIME_SLOT_LABELS[rescheduleJob.preferred_time_slot] ?? rescheduleJob.preferred_time_slot)
          : null;
        const priceLabel = rescheduleJob.budget_amount != null
          ? `$${Number(rescheduleJob.budget_amount).toFixed(2)}${rescheduleJob.budget_type === 'hourly' ? '/hr' : ''}`
          : null;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-gray-900">{isTradie ? 'Confirm visit time' : 'Reschedule job'}</h3>
                {serviceTag && (
                  <span className="inline-block mt-1 px-3 py-1 rounded-full bg-secondary-50 text-secondary-700 border border-secondary-200 text-xs font-medium uppercase tracking-wide">
                    {serviceTag}
                  </span>
                )}
                <p className="text-sm font-medium text-gray-700 mt-1.5 line-clamp-2">{titleText}</p>
              </div>
              <button onClick={() => { setRescheduleJob(null); setRescheduleDate(''); setRescheduleSlot(''); setRescheduleTime(''); setRescheduleDuration(120); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 ml-3 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current details — so user knows what they're moving */}
            {(currentDateLabel || currentSlotLabel || rescheduleJob.location_address || rescheduleJob.contact_name || priceLabel) && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Currently scheduled</p>
                {currentDateLabel && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{currentDateLabel}{currentSlotLabel ? ` · ${currentSlotLabel}` : ''}</span>
                  </div>
                )}
                {!currentDateLabel && currentSlotLabel && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{currentSlotLabel}</span>
                  </div>
                )}
                {rescheduleJob.contact_name && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{rescheduleJob.contact_name}</span>
                  </div>
                )}
                {rescheduleJob.location_address && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{rescheduleJob.location_address}</span>
                  </div>
                )}
                {priceLabel && (
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <span className="w-3.5 h-3.5 flex items-center justify-center text-gray-400 flex-shrink-0 text-xs font-bold">$</span>
                    <span>{priceLabel}</span>
                  </div>
                )}
              </div>
            )}

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">New Date</label>
                {/* Quick-pick chips — anchor to the current scheduled date when present,
                    otherwise to today, so "+1 week" still means "same day next week". */}
                {(() => {
                  const anchorStr = rescheduleJob.scheduled_date ?? toLocalDateStr(new Date());
                  const anchor = new Date(anchorStr + 'T00:00:00');
                  const addDays = (n: number) => {
                    const d = new Date(anchor);
                    d.setDate(d.getDate() + n);
                    return toLocalDateStr(d);
                  };
                  const tomorrowDate = (() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    return toLocalDateStr(d);
                  })();
                  const chips: { label: string; value: string }[] = [
                    { label: '+1 week', value: addDays(7) },
                    { label: '+2 weeks', value: addDays(14) },
                    { label: 'Tomorrow', value: tomorrowDate },
                  ];
                  return (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {chips.map(c => {
                        const active = rescheduleDate === c.value;
                        return (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => setRescheduleDate(c.value)}
                            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              active
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  min={toLocalDateStr(new Date())}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              {!rescheduleJob.id.startsWith('recurring-') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Time Slot</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setRescheduleSlot('')}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        rescheduleSlot === ''
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      No preference
                    </button>
                    {(['morning', 'midday', 'afternoon', 'evening'] as const).map(slot => {
                      const active = rescheduleSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setRescheduleSlot(slot)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                            active
                              ? 'bg-emerald-500 text-white border-emerald-500'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {TIME_SLOT_LABELS[slot] ?? slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!rescheduleJob.id.startsWith('recurring-') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{isTradie ? 'Confirm start time & duration' : 'Preferred start time (optional)'}</label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={e => setRescheduleTime(e.target.value)}
                      className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <select
                      value={rescheduleDuration}
                      onChange={e => setRescheduleDuration(Number(e.target.value))}
                      disabled={!rescheduleTime}
                      className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-50 disabled:bg-gray-50"
                    >
                      {DURATION_OPTIONS.map(d => (
                        <option key={d.minutes} value={d.minutes}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  {rescheduleTime ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-secondary-700">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      {isTradie ? 'Booked' : 'Roughly'} <span className="font-semibold">{formatJobTime(rescheduleTime)} – {formatJobTime(addMinutesToTime(rescheduleTime, rescheduleDuration))}</span>
                      {!isTradie && <span className="text-gray-400">· the tradie confirms the final time</span>}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-400">
                      {isTradie ? 'Set the start time and how long it takes.' : 'Set a preferred start time, or leave blank to use the time slot above.'}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => { setRescheduleJob(null); setRescheduleDate(''); setRescheduleSlot(''); setRescheduleTime(''); setRescheduleDuration(120); }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={!rescheduleDate || rescheduleSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {rescheduleSaving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CalendarClock className="w-4 h-4" />
                  )}
                  {isTradie ? 'Confirm time' : 'Reschedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Remove Confirmation Modal */}
      {removeConfirmJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Remove This Job?</h3>
              <p className="text-sm text-gray-500 mb-1 line-clamp-2">{removeConfirmJob.description}</p>
              {removeConfirmJob.scheduled_date && (
                <p className="text-xs text-gray-400">
                  Scheduled for {new Date(removeConfirmJob.scheduled_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              <p className="text-sm text-gray-600 mt-3">
                This will permanently cancel this {removeConfirmJob.id.startsWith('recurring-') ? 'session' : 'job'}. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 pb-6">
              <button
                onClick={() => setRemoveConfirmJob(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Job
              </button>
              <button
                onClick={handleRemoveJob}
                disabled={removeSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {removeSaving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedJob && showAssignModal && (
        <AssignTeamModal
          job={selectedJob}
          teamMembers={teamMembers}
          existingAssignments={selectedJobAssignments}
          onClose={() => setShowAssignModal(false)}
          onSave={handleAssign}
          onRemove={handleRemoveAssignment}
        />
      )}
    </>
  );

  // Collapsed mode: a compact "next visit" bar instead of the full grid.
  const nextEntry = (() => {
    const todayStr = toLocalDateStr(new Date());
    return jobs
      .filter((j) => j.scheduled_date && j.scheduled_date >= todayStr && j.status !== 'completed' && j.status !== 'cancelled')
      .sort((a, b) => {
        const byDate = (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
        return byDate !== 0 ? byDate : (a.start_time || '99:99').localeCompare(b.start_time || '99:99');
      })[0] || null;
  })();

  const collapsedView = (
    <div className="max-w-[1600px] mx-auto">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-warm-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Calendar</p>
            {loading ? (
              <p className="text-sm font-semibold text-gray-400">Loading…</p>
            ) : nextEntry ? (
              <p className="text-sm font-semibold text-gray-900 truncate">
                Next visit: {new Date(nextEntry.scheduled_date! + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                {formatJobTime(nextEntry.start_time) ? ` · ${formatJobTime(nextEntry.start_time)}` : ''}
              </p>
            ) : (
              <p className="text-sm font-semibold text-gray-900">No upcoming visits scheduled</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setCalendarCollapsed(false)}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <Calendar className="w-4 h-4" />
          View calendar
        </button>
      </div>
    </div>
  );

  if (defaultCollapsed && calendarCollapsed) {
    return embedded ? collapsedView : <DashboardLayout>{collapsedView}</DashboardLayout>;
  }
  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
