import { proseInputProps } from '../lib/proseInput';
import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Phone, Briefcase, MoreVertical, Pencil, Trash2, UserCheck, UserPlus, Star, HardHat, Wrench, X, Check, AlertCircle, Clock, Shield, Calendar, ChevronLeft, ChevronRight, Lock, Timer, CheckCircle2, XCircle, MapPin, LogIn, LogOut, Navigation } from 'lucide-react';
import SiteActivityTab from '../components/team/SiteActivityTab';
import MyHoursTab from '../components/team/MyHoursTab';
import { formatTime, formatDuration } from '../lib/siteActivity';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface LinkedEmployee {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  employment_type: 'employee' | 'subcontractor';
  employer_status: 'active' | 'pending_approval' | 'rejected';
  created_at: string;
  tradie_details: {
    trade_category: string;
    business_name: string;
  } | null;
}

interface TeamMember {
  id: string;
  business_owner_id: string;
  member_profile_id: string | null;
  invite_email: string | null;
  invite_name: string;
  invite_phone: string;
  role: 'employee' | 'subcontractor' | 'apprentice';
  trade_specialty: string;
  status: 'invited' | 'active' | 'inactive';
  hourly_rate: number;
  notes: string;
  invited_at: string;
  joined_at: string | null;
}

type ActiveTab = 'active' | 'manual' | 'permissions' | 'calendar' | 'timesheets' | 'siteactivity' | 'myhours';

interface TimeEntry {
  id: string;
  team_member_id: string;
  member_name: string;
  business_owner_id: string;
  job_id: string | null;
  date: string;
  hours: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  source: string;
  arrived_at: string | null;
  departed_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  subcontractor: 'Subcontractor',
  apprentice: 'Apprentice',
};

/**
 * Local calendar date as yyyy-mm-dd — NOT via toISOString(), which converts to
 * UTC and shifts the day in timezones ahead of UTC. time_entries.date is a plain
 * calendar date, so week boundaries and the "today" default must be local.
 */
const toLocalYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const ROLE_COLORS: Record<string, string> = {
  employee: 'bg-secondary-100 text-secondary-700',
  subcontractor: 'bg-warm-100 text-warm-700',
  apprentice: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  invited: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
};

const ROLE_PERMISSIONS: Record<string, { label: string; permissions: string[] }> = {
  employee: {
    label: 'Employee',
    permissions: ['View assigned jobs', 'Update job status', 'Log hours', 'View team calendar', 'Send messages'],
  },
  subcontractor: {
    label: 'Subcontractor',
    permissions: ['View assigned jobs', 'Submit quotes', 'Update job status', 'View own calendar'],
  },
  apprentice: {
    label: 'Apprentice',
    permissions: ['View assigned jobs', 'Log hours', 'View team calendar'],
  },
};

interface AddMemberModalProps {
  onClose: () => void;
  onSave: (member: Partial<TeamMember>) => Promise<void>;
  editMember?: TeamMember | null;
}

function AddMemberModal({ onClose, onSave, editMember }: AddMemberModalProps) {
  const [form, setForm] = useState({
    invite_name: editMember?.invite_name || '',
    invite_email: editMember?.invite_email || '',
    invite_phone: editMember?.invite_phone || '',
    role: editMember?.role || 'employee',
    trade_specialty: editMember?.trade_specialty || '',
    hourly_rate: editMember?.hourly_rate || 0,
    notes: editMember?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invite_name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save team member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 ">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 p-6 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-secondary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900">{editMember ? 'Edit team member' : 'Add a team member'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {editMember ? 'Update their details.' : 'Track someone in your business — assign them to jobs and log their hours.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-1 -mt-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!editMember && (
            <p className="text-xs text-gray-500 bg-secondary-50 border border-secondary-100 rounded-lg px-3 py-2.5 leading-relaxed">
              Added to your business for scheduling, job assignment and timesheets. They won’t get app notifications unless they join ConnecTradie and link to your business.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                value={form.invite_name}
                onChange={e => setForm(f => ({ ...f, invite_name: e.target.value }))}
                placeholder="e.g. Jake Morrison"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={form.invite_email}
                onChange={e => setForm(f => ({ ...f, invite_email: e.target.value }))}
                placeholder="jake@email.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.invite_phone}
                onChange={e => setForm(f => ({ ...f, invite_phone: e.target.value }))}
                placeholder="04xx xxx xxx"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamMember['role'] }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white"
              >
                <option value="employee">Employee</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="apprentice">Apprentice</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Trade / Specialty</label>
              <input
                type="text"
                value={form.trade_specialty}
                onChange={e => setForm(f => ({ ...f, trade_specialty: e.target.value }))}
                placeholder="e.g. Plumbing, Electrical"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate ($/hr)</label>
              <input
                type="number"
                min="0"
                step="0.50"
                value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea {...proseInputProps}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Any notes about this person, their skills, or working arrangement..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {editMember ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Team({ embedded = false }: { embedded?: boolean }) {
  const { user, profile } = useAuth();
  const [linkedEmployees, setLinkedEmployees] = useState<LinkedEmployee[]>([]);
  const [manualMembers, setManualMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string; type: 'linked' | 'manual' } | null>(null);

  // Timesheets state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timesheetWeekStart, setTimesheetWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({ member_id: '', date: toLocalYmd(new Date()), hours: '', description: '', job_id: '' });
  const [savingEntry, setSavingEntry] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());

  const fetchTimeEntries = async () => {
    if (!user) return;
    const weekEnd = new Date(timesheetWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('business_owner_id', user.id)
      .gte('date', toLocalYmd(timesheetWeekStart))
      .lte('date', toLocalYmd(weekEnd))
      .order('date', { ascending: true });
    if (data) {
      const entries = (data as unknown as TimeEntry[]).map(entry => {
        const member = [...activeTeam.map(e => ({ id: e.id, name: e.full_name })), ...manualMembers.map(m => ({ id: m.id, name: m.invite_name }))];
        const found = member.find(m => m.id === entry.team_member_id);
        return { ...entry, member_name: found?.name || 'Unknown' };
      });
      setTimeEntries(entries);
    }
  };

  const handleAddTimeEntry = async () => {
    if (!user || !entryForm.member_id || !entryForm.hours) return;
    setSavingEntry(true);
    try {
      const { error } = await supabase.from('time_entries').insert({
        team_member_id: entryForm.member_id,
        business_owner_id: user.id,
        job_id: entryForm.job_id || null,
        date: entryForm.date,
        hours: parseFloat(entryForm.hours),
        description: entryForm.description,
      });
      if (error) throw error;
      setShowAddEntry(false);
      setEntryForm({ member_id: '', date: toLocalYmd(new Date()), hours: '', description: '', job_id: '' });
      fetchTimeEntries();
    } catch (err) {
      console.error('Failed to add time entry:', err);
    }
    setSavingEntry(false);
  };

  const handleUpdateEntryStatus = async (entryId: string, status: 'approved' | 'rejected') => {
    if (!user) return;
    try {
      const { error } = await supabase.from('time_entries').update({
        status,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).eq('id', entryId);
      if (error) throw error;
      fetchTimeEntries();
    } catch (err) {
      console.error('Failed to update time entry status:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLinkedEmployees();
      fetchManualMembers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user && activeTab === 'timesheets') {
      fetchTimeEntries();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeTab, timesheetWeekStart]);

  const fetchLinkedEmployees = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, employment_type, employer_status, created_at, tradie_details(trade_category, business_name)')
      .eq('employer_id', user.id)
      .in('employer_status', ['active', 'pending_approval'])
      .order('created_at', { ascending: false });

    setLinkedEmployees((data as unknown as LinkedEmployee[]) || []);
    setLoading(false);
  };

  const fetchManualMembers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('business_team_members')
      .select('*')
      .eq('business_owner_id', user.id)
      .is('member_profile_id', null)
      .order('created_at', { ascending: false });
    
    setManualMembers((data as unknown as TeamMember[]) || []);
  };

  const handleApproveRequest = async (employeeId: string) => {
    setProcessingId(employeeId);
    try {
      const { error: rpcError } = await supabase.rpc('employer_approve_member', { member_id: employeeId });
      if (rpcError) throw rpcError;

      await supabase
        .from('business_team_members')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .eq('member_profile_id', employeeId)
        .eq('business_owner_id', user!.id);

      const emp = linkedEmployees.find(e => e.id === employeeId);
      const roleLabel = emp?.employment_type === 'employee' ? 'employee' : 'subcontractor';
      await supabase.rpc('create_notification', {
        p_user_id: employeeId,
        p_title: 'Request approved',
        p_message: `Your request to join as ${roleLabel} has been approved. You are now part of the team.`,
        p_type: 'team',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/dashboard',
      });

      await fetchLinkedEmployees();
    } catch {
      // no-op
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (employeeId: string) => {
    setProcessingId(employeeId);
    try {
      const { error: rpcError } = await supabase.rpc('employer_decline_member', { member_id: employeeId });
      if (rpcError) throw rpcError;

      await supabase
        .from('business_team_members')
        .update({ status: 'inactive' })
        .eq('member_profile_id', employeeId)
        .eq('business_owner_id', user!.id);

      await supabase.rpc('create_notification', {
        p_user_id: employeeId,
        p_title: 'Request declined',
        p_message: `Your team request has been declined.`,
        p_type: 'team',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/dashboard',
      });

      setLinkedEmployees(prev => prev.filter(e => e.id !== employeeId));
    } catch {
      // no-op
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveEmployee = async (employeeId: string) => {
    setProcessingId(employeeId);
    try {
      const { error: rpcError } = await supabase.rpc('employer_remove_member', { member_id: employeeId });
      if (rpcError) throw rpcError;

      await supabase
        .from('business_team_members')
        .update({ status: 'inactive' })
        .eq('member_profile_id', employeeId)
        .eq('business_owner_id', user!.id);

      await supabase.rpc('create_notification', {
        p_user_id: employeeId,
        p_title: 'Removed from team',
        p_message: `You have been removed from the team.`,
        p_type: 'team',
        p_channel: 'in_app',
        p_read: false,
        p_link: '/dashboard',
      });

      setLinkedEmployees(prev => prev.filter(e => e.id !== employeeId));
    } catch {
      // no-op
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaveManual = async (memberData: Partial<TeamMember>) => {
    if (!user) return;
    if (editMember) {
      const { error } = await supabase
        .from('business_team_members')
        .update({ ...memberData, updated_at: new Date().toISOString() })
        .eq('id', editMember.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('business_team_members')
        .insert({ ...memberData, business_owner_id: user.id, status: 'active' });
      if (error) throw new Error(error.message);
    }
    await fetchManualMembers();
    setEditMember(null);
  };

  const handleDeleteManual = async (id: string) => {
    try {
      const { error } = await supabase.from('business_team_members').delete().eq('id', id);
      if (error) throw error;
      setManualMembers(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete team member:', err);
    }
  };

  const activeTeam = linkedEmployees.filter(e => e.employer_status === 'active');
  const pendingRequests = linkedEmployees.filter(e => e.employer_status === 'pending_approval');

  const stats = {
    total: activeTeam.length + manualMembers.filter(m => m.status === 'active').length,
    active: activeTeam.length,
    pending: pendingRequests.length,
    manual: manualMembers.length,
  };

  // Travel time between a worker's consecutive geofenced sites on the same day
  // (one site's departure → the next site's arrival), keyed by the later entry.
  const geofenceTravelMs: Record<string, number> = {};
  {
    const byDay: Record<string, TimeEntry[]> = {};
    for (const e of timeEntries) {
      if (e.source !== 'geofence' || !e.arrived_at) continue;
      (byDay[`${e.team_member_id}|${e.date}`] ||= []).push(e);
    }
    for (const key of Object.keys(byDay)) {
      const list = byDay[key].slice().sort((a, b) => (a.arrived_at! < b.arrived_at! ? -1 : 1));
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i];
        if (prev.departed_at && cur.arrived_at) {
          const ms = new Date(cur.arrived_at).getTime() - new Date(prev.departed_at).getTime();
          if (ms > 0) geofenceTravelMs[cur.id] = ms;
        }
      }
    }
  }

  if (profile?.role !== 'tradie') {
    const notAvailable = (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <HardHat className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Team Management</h2>
        <p className="text-gray-500">This feature is available for trade businesses.</p>
      </div>
    );
    if (embedded) return notAvailable;
    return <DashboardLayout><SectionErrorBoundary>{notAvailable}</SectionErrorBoundary></DashboardLayout>;
  }

  const calDaysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const calStartDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  const calMonthLabel = calMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const allMembers = [
    ...activeTeam.map(e => ({ name: e.full_name, role: e.employment_type })),
    ...manualMembers.filter(m => m.status === 'active').map(m => ({ name: m.invite_name, role: m.role })),
  ];

  // A tradie who is themselves an active employee/subcontractor gets a read-only
  // view of the hours their employer has on record for them.
  const isEmployed = !!profile?.employer_id && profile?.employer_status === 'active';
  const teamTabs: { key: ActiveTab; label: string; count: number; icon: typeof Users }[] = [
    ...(isEmployed ? [{ key: 'myhours' as ActiveTab, label: 'My Hours', count: 0, icon: Clock }] : []),
    { key: 'active', label: 'Active Team', count: activeTeam.length, icon: UserCheck },
    { key: 'manual', label: 'Manually Added', count: manualMembers.length, icon: Users },
    { key: 'permissions', label: 'Role Permissions', count: 0, icon: Lock },
    { key: 'calendar', label: 'Team Calendar', count: 0, icon: Calendar },
    { key: 'timesheets', label: 'Timesheets', count: 0, icon: Timer },
    { key: 'siteactivity', label: 'Site Activity', count: 0, icon: MapPin },
  ];

  const content = (
    <>
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Team</h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">Manage employees and subcontractors in your business</p>
          </div>
          <button
            onClick={() => { setEditMember(null); setShowAddModal(true); }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 transition-colors text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-secondary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total active</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                <p className="text-sm text-gray-500">Approved</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warm-50 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-warm-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
                <p className="text-sm text-gray-500">Pending</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                <Wrench className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.manual}</p>
                <p className="text-sm text-gray-500">Manual</p>
              </div>
            </div>
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <div className="bg-warm-50 border-2 border-warm-300 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-200 bg-warm-100/60">
              <div className="w-8 h-8 bg-warm-200 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-warm-700" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-warm-900">Pending requests</h2>
                <p className="text-xs text-warm-700 mt-0.5">These users want to join your team. Review and approve or decline.</p>
              </div>
              <span className="px-3 py-1 bg-warm-200 text-warm-800 rounded-full text-xs font-medium">
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="divide-y divide-warm-200">
              {pendingRequests.map(emp => (
                <div key={emp.id} className="flex items-center gap-4 p-5 bg-white/40 flex-wrap sm:flex-nowrap">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-warm-200 to-warm-300 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-warm-800">
                      {emp.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{emp.full_name}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[emp.employment_type]}`}>
                        {ROLE_LABELS[emp.employment_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {emp.tradie_details?.trade_category && (
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Briefcase className="w-3.5 h-3.5" />
                          {emp.tradie_details.trade_category}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <Mail className="w-3.5 h-3.5" />
                        {emp.email}
                      </span>
                      {emp.phone && (
                        <span className="flex items-center gap-1 text-sm text-gray-500">
                          <Phone className="w-3.5 h-3.5" />
                          {emp.phone}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(emp.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDeclineRequest(emp.id)}
                      disabled={processingId === emp.id}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Decline
                    </button>
                    <button
                      onClick={() => handleApproveRequest(emp.id)}
                      disabled={processingId === emp.id}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {processingId === emp.id ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            {teamTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 sm:py-4 -mb-px text-xs sm:text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                  activeTab === tab.key
                    ? 'border-warm-500 text-warm-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label === 'Role Permissions' ? 'Roles' : tab.label === 'Manually Added' ? 'Manual' : tab.label === 'Active Team' ? 'Active' : tab.label === 'Team Calendar' ? 'Calendar' : tab.label === 'Site Activity' ? 'Sites' : tab.label === 'My Hours' ? 'Hours' : tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.key ? 'bg-warm-100 text-warm-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="divide-y divide-gray-50">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4 p-5 animate-pulse">
                  <div className="w-12 h-12 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'active' ? (
            activeTeam.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 bg-secondary-50 rounded-2xl flex items-center justify-center mb-4">
                  <UserCheck className="w-8 h-8 text-secondary-400" />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">Your team starts here</h3>
                <p className="text-sm text-gray-500 max-w-xs">
                  Approve a join request and your workers appear here, ready to be assigned to jobs.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {activeTeam.map(emp => (
                  <div key={emp.id} className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 hover:bg-gray-50/50 transition-colors group">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-green-700">
                        {emp.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{emp.full_name}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[emp.employment_type]}`}>
                          {ROLE_LABELS[emp.employment_type]}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Active
                        </span>
                      </div>
                      {/* Meta: stack on mobile so long emails truncate on their own line
                          instead of wrapping/squishing; inline row on sm+. */}
                      <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 sm:flex-wrap">
                        {emp.tradie_details?.trade_category && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                            <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{emp.tradie_details.trade_category}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{emp.email}</span>
                        </span>
                        {emp.phone && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{emp.phone}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setMemberToRemove({ id: emp.id, name: emp.full_name, type: 'linked' })}
                      disabled={processingId === emp.id}
                      title="Remove team member"
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors sm:opacity-0 opacity-60 group-hover:opacity-100 min-h-[44px] flex-shrink-0"
                    >
                      {processingId === emp.id ? (
                        <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'permissions' ? (
            <div className="p-5 space-y-4">
              {Object.entries(ROLE_PERMISSIONS).map(([key, { label, permissions }]) => (
                <div key={key} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[key]}`}>{label}</span>
                    <span className="text-xs text-gray-400">
                      {allMembers.filter(m => m.role === key).length} member{allMembers.filter(m => m.role === key).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {permissions.map(p => (
                      <div key={p} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'calendar' ? (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-semibold text-gray-900">{calMonthLabel}</h3>
                <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: calStartDay }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: calDaysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const now = new Date();
                  const isToday = day === now.getDate() && calMonth.getMonth() === now.getMonth() && calMonth.getFullYear() === now.getFullYear();
                  const isWeekend = new Date(calMonth.getFullYear(), calMonth.getMonth(), day).getDay() % 6 === 0;
                  const isPast = new Date(calMonth.getFullYear(), calMonth.getMonth(), day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  return (
                    <div key={day} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${isPast ? 'opacity-50' : ''} ${isToday ? 'bg-primary-100 border border-primary-300 font-bold text-primary-700' : isWeekend ? 'bg-gray-50 text-gray-400' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                      <span>{day}</span>
                      {allMembers.length > 0 && !isWeekend && (
                        <div className="flex gap-0.5 mt-0.5">
                          {allMembers.slice(0, 3).map((m, idx) => (
                            <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-green-400' : idx === 1 ? 'bg-secondary-400' : 'bg-warm-400'}`} title={m.name} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {allMembers.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {allMembers.slice(0, 5).map((m, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-green-400' : idx === 1 ? 'bg-secondary-400' : idx === 2 ? 'bg-warm-400' : 'bg-primary-400'}`} />
                      {m.name}
                    </div>
                  ))}
                </div>
              )}
              {allMembers.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">No active team members to show on the calendar</div>
              )}
            </div>
          ) : activeTab === 'timesheets' ? (
            <div className="p-5 space-y-4">
              {/* Week Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { const d = new Date(timesheetWeekStart); d.setDate(d.getDate() - 7); setTimesheetWeekStart(d); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-semibold text-gray-900">
                  Week of {timesheetWeekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </h3>
                <button
                  onClick={() => { const d = new Date(timesheetWeekStart); d.setDate(d.getDate() + 7); setTimesheetWeekStart(d); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Add Entry Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAddEntry(!showAddEntry)}
                  className="flex items-center gap-2 px-4 py-2 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </button>
              </div>

              {/* Inline Add Entry Form */}
              {showAddEntry && (
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Team Member *</label>
                      <select
                        value={entryForm.member_id}
                        onChange={e => setEntryForm(f => ({ ...f, member_id: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      >
                        <option value="">Select member...</option>
                        {activeTeam.map(e => (
                          <option key={e.id} value={e.id}>{e.full_name}</option>
                        ))}
                        {manualMembers.filter(m => m.status === 'active').map(m => (
                          <option key={m.id} value={m.id}>{m.invite_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                      <input
                        type="date"
                        value={entryForm.date}
                        onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
                      <input
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={entryForm.hours}
                        onChange={e => setEntryForm(f => ({ ...f, hours: e.target.value }))}
                        placeholder="8"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Job (optional)</label>
                      <input
                        type="text"
                        value={entryForm.job_id}
                        onChange={e => setEntryForm(f => ({ ...f, job_id: e.target.value }))}
                        placeholder="Job ID"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={entryForm.description}
                      onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What was worked on..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowAddEntry(false)}
                      className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTimeEntry}
                      disabled={savingEntry || !entryForm.member_id || !entryForm.hours}
                      className="px-4 py-2 bg-warm-500 text-white text-sm font-medium rounded-lg hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {savingEntry && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      Save Entry
                    </button>
                  </div>
                </div>
              )}

              {/* Weekly Totals per Member */}
              {(() => {
                const memberTotals: Record<string, { name: string; hours: number }> = {};
                timeEntries.forEach(e => {
                  if (!memberTotals[e.team_member_id]) memberTotals[e.team_member_id] = { name: e.member_name, hours: 0 };
                  memberTotals[e.team_member_id].hours += Number(e.hours);
                });
                const totals = Object.values(memberTotals);
                if (totals.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-3">
                    {totals.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-lg border border-primary-100">
                        <Timer className="w-4 h-4 text-primary-600" />
                        <span className="text-sm font-medium text-gray-900">{t.name}</span>
                        <span className="text-sm font-bold text-primary-700">{t.hours}h</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Time Entries List */}
              {timeEntries.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  <Timer className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-600">No time entries this week</p>
                  <p className="text-xs mt-1">Add entries to start tracking your team's hours</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                  {timeEntries.map(entry => (
                    <div key={entry.id} className="flex items-center gap-4 p-4 bg-white hover:bg-gray-50/50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary-700">
                          {entry.member_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{entry.member_name}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            entry.status === 'approved' ? 'bg-green-100 text-green-700'
                            : entry.status === 'rejected' ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </span>
                          {entry.source === 'geofence' && (
                            <span
                              title="Auto-logged from on-site check-in"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary-50 text-secondary-700"
                            >
                              <MapPin className="w-3 h-3" /> Auto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span>{new Date(entry.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span className="font-semibold text-gray-700">{entry.hours}h</span>
                          {entry.description && <span className="truncate">{entry.description}</span>}
                        </div>
                        {entry.source === 'geofence' && entry.arrived_at && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                            <span className="inline-flex items-center gap-1" title="Arrived on site">
                              <LogIn className="w-3.5 h-3.5 text-gray-400" /> {formatTime(entry.arrived_at)}
                            </span>
                            <span className="inline-flex items-center gap-1" title="Left site">
                              <LogOut className="w-3.5 h-3.5 text-gray-400" /> {entry.departed_at ? formatTime(entry.departed_at) : '—'}
                            </span>
                            {geofenceTravelMs[entry.id] != null && (
                              <span className="inline-flex items-center gap-1 text-secondary-600" title="Travel from the previous site">
                                <Navigation className="w-3.5 h-3.5" /> {formatDuration(geofenceTravelMs[entry.id])} drive from last site
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {entry.status === 'pending' && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleUpdateEntryStatus(entry.id, 'approved')}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleUpdateEntryStatus(entry.id, 'rejected')}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'myhours' ? (
            <MyHoursTab />
          ) : activeTab === 'siteactivity' ? (
            <SiteActivityTab
              activeMembers={activeTeam.map(e => ({
                id: e.id,
                full_name: e.full_name,
                employment_type: e.employment_type,
              }))}
            />
          ) : (
            manualMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="font-semibold text-gray-700 mb-1">No manually added members</h3>
                <p className="text-sm text-gray-400 max-w-xs mb-6">
                  Use "Add Member" to manually track team members who aren't on ConnectTradie yet.
                </p>
                <button
                  onClick={() => { setEditMember(null); setShowAddModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add First Member
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {manualMembers.map(member => (
                  <div key={member.id} className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 hover:bg-gray-50/50 transition-colors group">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-primary-700">
                        {member.invite_name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{member.invite_name}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[member.status]}`}>
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                        </span>
                      </div>
                      {/* Meta: stack on mobile so long emails truncate on their own
                          full-width line instead of wrapping; inline row on sm+. */}
                      <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 sm:flex-wrap">
                        {member.trade_specialty && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                            <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{member.trade_specialty}</span>
                          </span>
                        )}
                        {member.invite_email && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{member.invite_email}</span>
                          </span>
                        )}
                        {member.invite_phone && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{member.invite_phone}</span>
                          </span>
                        )}
                        {member.hourly_rate > 0 && (
                          <span className="flex items-center gap-1.5 text-sm text-gray-500 flex-shrink-0">
                            <Star className="w-3.5 h-3.5 flex-shrink-0" />
                            ${member.hourly_rate}/hr
                          </span>
                        )}
                      </div>
                      {member.notes && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{member.notes}</p>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 sm:opacity-0 opacity-60 group-hover:opacity-100 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === member.id && (
                        <div className="absolute right-0 top-10 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                          <button
                            onClick={() => { setEditMember(member); setShowAddModal(true); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit Details
                          </button>
                          <button
                            onClick={() => { setMemberToRemove({ id: member.id, name: member.invite_name, type: 'manual' }); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {showAddModal && (
        <AddMemberModal
          onClose={() => { setShowAddModal(false); setEditMember(null); }}
          onSave={handleSaveManual}
          editMember={editMember}
        />
      )}

      {memberToRemove && (
        <ConfirmModal
          title="Remove Team Member"
          message={`Are you sure you want to remove ${memberToRemove.name} from your team? This action cannot be undone.`}
          confirmText="Remove"
          type="danger"
          onConfirm={async () => {
            const { id, type } = memberToRemove;
            setMemberToRemove(null);
            if (type === 'linked') {
              await handleRemoveEmployee(id);
            } else {
              await handleDeleteManual(id);
            }
          }}
          onCancel={() => setMemberToRemove(null)}
        />
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout><SectionErrorBoundary>{content}</SectionErrorBoundary></DashboardLayout>;
}
