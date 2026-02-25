import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, MapPin, Users, Clock, Plus, X, User, Layers, AlertCircle, Filter } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Job {
  id: string;
  description: string;
  status: string;
  scheduled_date: string | null;
  preferred_time_slot: string | null;
  location_address: string | null;
  contact_name: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  is_emergency: boolean;
  project_id: string | null;
  tradie_id: string | null;
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
}

const TIME_SLOT_LABELS: Record<string, string> = {
  morning: 'Morning (6am–12pm)',
  midday: 'Midday (12pm–2pm)',
  afternoon: 'Afternoon (2pm–6pm)',
  evening: 'Evening (6pm–9pm)',
};

const TIME_SLOT_COLORS: Record<string, string> = {
  morning: 'bg-amber-50 border-amber-200 text-amber-800',
  midday: 'bg-blue-50 border-blue-200 text-blue-800',
  afternoon: 'bg-orange-50 border-orange-200 text-orange-800',
  evening: 'bg-slate-50 border-slate-200 text-slate-700',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  accepted: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-primary-100 text-primary-700 border-primary-200',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm"
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

export default function SiteCalendar({ embedded = false }: { embedded?: boolean }) {
  const { user, profile } = useAuth();
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

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, currentDate, view]);

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
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const [jobsRes, membersRes, assignmentsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, description, status, scheduled_date, preferred_time_slot, location_address, contact_name, budget_amount, budget_type, is_emergency, project_id, tradie_id')
        .eq('tradie_id', user.id)
        .not('status', 'in', '(cancelled,declined)')
        .or(`scheduled_date.gte.${startStr},scheduled_date.lte.${endStr}`)
        .order('scheduled_date', { ascending: true }),

      supabase
        .from('business_team_members')
        .select('id, invite_name, role, trade_specialty, status')
        .eq('business_owner_id', user.id)
        .eq('status', 'active'),

      supabase
        .from('job_team_assignments')
        .select('*')
        .eq('business_owner_id', user.id)
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr),
    ]);

    setJobs(jobsRes.data || []);
    setTeamMembers(membersRes.data || []);
    setAssignments(assignmentsRes.data || []);
    setLoading(false);
  };

  const handleAssign = async (jobId: string, memberId: string, data: Partial<JobAssignment>) => {
    if (!user) return;
    const { error } = await supabase.from('job_team_assignments').insert({
      job_id: jobId,
      team_member_id: memberId,
      business_owner_id: user.id,
      ...data,
    });
    if (error) throw new Error(error.message);
    await fetchData();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    await supabase.from('job_team_assignments').delete().eq('id', assignmentId);
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
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
    const dateStr = date.toISOString().split('T')[0];
    const dayJobs = jobs.filter(j => j.scheduled_date === dateStr);

    const entriesForDate = dayJobs.map(job => {
      const jobAssignments = assignments
        .filter(a => a.job_id === job.id)
        .map(a => ({
          ...a,
          member: teamMembers.find(m => m.id === a.team_member_id) as TeamMember,
        }))
        .filter(a => a.member);

      const sameLocationJobs = dayJobs.filter(
        j => j.id !== job.id && j.location_address && job.location_address &&
          j.location_address.toLowerCase().includes(job.location_address.split(',')[0].toLowerCase())
      );

      return {
        job,
        assignments: jobAssignments,
        conflictWarning: sameLocationJobs.length > 0,
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' });
  };

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

  const conflictCount = jobs.filter(j => {
    const sameDateJobs = jobs.filter(j2 => j2.id !== j.id && j2.scheduled_date === j.scheduled_date);
    return sameDateJobs.some(j2 => j2.location_address && j.location_address &&
      j2.location_address.toLowerCase().includes(j.location_address.split(',')[0].toLowerCase()));
  }).length;

  const selectedJobAssignments = selectedJob
    ? assignments.filter(a => a.job_id === selectedJob.id)
    : [];

  const days = view === 'week' ? getWeekDays() : [];
  const monthDays = view === 'month' ? getMonthDays() : [];

  const content = (
    <>
      <div className="space-y-5 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Site Calendar</h1>
            <p className="text-gray-500 mt-1">Track all jobs, team assignments, and avoid double-booking</p>
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
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'week' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >Week</button>
              <button
                onClick={() => setView('month')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'month' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
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
                return (
                  <div key={i} className={`flex flex-col ${today ? 'bg-primary-50/30' : ''}`}>
                    <div className={`px-2 py-3 text-center border-b border-gray-100 ${today ? 'bg-primary-50' : ''}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{day.toLocaleDateString('en-AU', { weekday: 'short' })}</p>
                      <p className={`text-lg font-bold mt-0.5 ${today ? 'text-primary-600' : 'text-gray-900'}`}>{day.getDate()}</p>
                    </div>
                    <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[600px]">
                      {entries.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-xs text-gray-300 py-4">No jobs</p>
                        </div>
                      ) : (
                        entries.map(({ job, assignments: jobAssignments, conflictWarning }) => (
                          <div
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className={`relative p-2 rounded-lg border cursor-pointer hover:shadow-md transition-all text-xs ${
                              job.is_emergency
                                ? 'bg-red-50 border-red-200'
                                : conflictWarning
                                ? 'bg-orange-50 border-orange-200'
                                : 'bg-white border-gray-200 hover:border-primary-300'
                            }`}
                          >
                            {conflictWarning && (
                              <AlertCircle className="absolute top-1.5 right-1.5 w-3 h-3 text-orange-500" />
                            )}
                            <p className="font-medium text-gray-900 line-clamp-2 mb-1">{job.description}</p>
                            {job.preferred_time_slot && (
                              <p className="text-gray-500">{job.preferred_time_slot}</p>
                            )}
                            {job.location_address && (
                              <p className="flex items-center gap-0.5 text-gray-400 mt-0.5 truncate">
                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">{job.location_address.split(',')[0]}</span>
                              </p>
                            )}
                            {jobAssignments.length > 0 && (
                              <div className="flex items-center gap-1 mt-1.5">
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
                        ))
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
                  return (
                    <div key={i} className={`min-h-[100px] p-2 ${today ? 'bg-primary-50/30' : 'hover:bg-gray-50/50'} transition-colors`}>
                      <p className={`text-sm font-semibold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full ${
                        today ? 'bg-primary-600 text-white' : 'text-gray-700'
                      }`}>
                        {day.getDate()}
                      </p>
                      <div className="space-y-1">
                        {entries.slice(0, 3).map(({ job, conflictWarning }) => (
                          <div
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className={`px-2 py-1 rounded text-xs cursor-pointer truncate border font-medium transition-colors ${
                              job.is_emergency
                                ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                                : conflictWarning
                                ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
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

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[selectedJob.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {selectedJob.status.replace('_', ' ')}
                  </span>
                  {selectedJob.is_emergency && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Emergency</span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-gray-900 line-clamp-2">{selectedJob.description}</h2>
              </div>
              <button onClick={() => setSelectedJob(null)} className="ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {selectedJob.scheduled_date && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Date</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(selectedJob.scheduled_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )}
                {selectedJob.preferred_time_slot && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl border ${TIME_SLOT_COLORS[selectedJob.preferred_time_slot] || 'bg-gray-50 border-gray-200'}`}>
                    <Clock className="w-4 h-4" />
                    <div>
                      <p className="text-xs opacity-70">Time</p>
                      <p className="text-sm font-medium">{selectedJob.preferred_time_slot.charAt(0).toUpperCase() + selectedJob.preferred_time_slot.slice(1)}</p>
                    </div>
                  </div>
                )}
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

              {teamMembers.length > 0 && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-primary-300 text-primary-600 font-medium rounded-xl hover:bg-primary-50 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Assign Team Members
                </button>
              )}
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

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
