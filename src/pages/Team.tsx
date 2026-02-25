import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Phone, Briefcase, MoreVertical, Pencil, Trash2, UserCheck, Star, HardHat, Wrench, X, Check, AlertCircle, Clock, Shield } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
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

type ActiveTab = 'active' | 'manual';

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  subcontractor: 'Subcontractor',
  apprentice: 'Apprentice',
};

const ROLE_COLORS: Record<string, string> = {
  employee: 'bg-blue-100 text-blue-700',
  subcontractor: 'bg-amber-100 text-amber-700',
  apprentice: 'bg-green-100 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  invited: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{editMember ? 'Edit Team Member' : 'Add Team Member'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add someone to your trade business team</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
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

            <div className="col-span-2">
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

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
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
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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

  useEffect(() => {
    if (user) {
      fetchLinkedEmployees();
      fetchManualMembers();
    }
  }, [user]);

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
    setManualMembers(data || []);
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
      await supabase.from('notifications').insert({
        user_id: employeeId,
        title: 'Request approved',
        message: `Your request to join as ${roleLabel} has been approved. You are now part of the team.`,
        type: 'team',
        channel: 'in_app',
        read: false,
        link: '/dashboard',
      });

      await fetchLinkedEmployees();
    } catch {
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

      await supabase.from('notifications').insert({
        user_id: employeeId,
        title: 'Request declined',
        message: `Your team request has been declined.`,
        type: 'team',
        channel: 'in_app',
        read: false,
        link: '/dashboard',
      });

      setLinkedEmployees(prev => prev.filter(e => e.id !== employeeId));
    } catch {
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveEmployee = async (employeeId: string) => {
    if (!confirm('Remove this person from your team? They will no longer be linked to your business.')) return;
    setProcessingId(employeeId);
    try {
      const { error: rpcError } = await supabase.rpc('employer_remove_member', { member_id: employeeId });
      if (rpcError) throw rpcError;

      await supabase
        .from('business_team_members')
        .update({ status: 'inactive' })
        .eq('member_profile_id', employeeId)
        .eq('business_owner_id', user!.id);

      await supabase.from('notifications').insert({
        user_id: employeeId,
        title: 'Removed from team',
        message: `You have been removed from the team.`,
        type: 'team',
        channel: 'in_app',
        read: false,
        link: '/dashboard',
      });

      setLinkedEmployees(prev => prev.filter(e => e.id !== employeeId));
    } catch {
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
    if (!confirm('Remove this team member?')) return;
    await supabase.from('business_team_members').delete().eq('id', id);
    setManualMembers(prev => prev.filter(m => m.id !== id));
  };

  const activeTeam = linkedEmployees.filter(e => e.employer_status === 'active');
  const pendingRequests = linkedEmployees.filter(e => e.employer_status === 'pending_approval');

  const stats = {
    total: activeTeam.length + manualMembers.filter(m => m.status === 'active').length,
    active: activeTeam.length,
    pending: pendingRequests.length,
    manual: manualMembers.length,
  };

  if (profile?.role !== 'tradie') {
    const notAvailable = (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <HardHat className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Team Management</h2>
        <p className="text-gray-500">This feature is available for trade businesses.</p>
      </div>
    );
    if (embedded) return notAvailable;
    return <DashboardLayout>{notAvailable}</DashboardLayout>;
  }

  const teamTabs: { key: 'active' | 'manual'; label: string; count: number; icon: typeof Users }[] = [
    { key: 'active', label: 'Active Team', count: activeTeam.length, icon: UserCheck },
    { key: 'manual', label: 'Manually Added', count: manualMembers.length, icon: Users },
  ];

  const content = (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
            <p className="text-gray-500 mt-1">Manage employees and subcontractors in your business</p>
          </div>
          <button
            onClick={() => { setEditMember(null); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Member
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Active</p>
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
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
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
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-200 bg-amber-100/60">
              <div className="w-8 h-8 bg-amber-200 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-amber-900">Pending Requests</h2>
                <p className="text-xs text-amber-700 mt-0.5">These users want to join your team. Review and approve or decline.</p>
              </div>
              <span className="px-2.5 py-1 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="divide-y divide-amber-200">
              {pendingRequests.map(emp => (
                <div key={emp.id} className="flex items-center gap-4 p-5 bg-white/40">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-amber-800">
                      {emp.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{emp.full_name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[emp.employment_type]}`}>
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
          <div className="flex border-b border-gray-100">
            {teamTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-primary-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />
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
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                  <UserCheck className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="font-semibold text-gray-700 mb-1">No active team members yet</h3>
                <p className="text-sm text-gray-400 max-w-xs">
                  When you approve a team request, they'll appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {activeTeam.map(emp => (
                  <div key={emp.id} className="flex items-center gap-4 p-5 hover:bg-gray-50/50 transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-green-700">
                        {emp.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{emp.full_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[emp.employment_type]}`}>
                          {ROLE_LABELS[emp.employment_type]}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Active
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {emp.tradie_details?.trade_category && (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
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
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveEmployee(emp.id)}
                      disabled={processingId === emp.id}
                      className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {processingId === emp.id ? (
                        <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )
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
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add First Member
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {manualMembers.map(member => (
                  <div key={member.id} className="flex items-center gap-4 p-5 hover:bg-gray-50/50 transition-colors group">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-primary-700">
                        {member.invite_name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{member.invite_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[member.status]}`}>
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {member.trade_specialty && (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Briefcase className="w-3.5 h-3.5" />
                            {member.trade_specialty}
                          </span>
                        )}
                        {member.invite_email && (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Mail className="w-3.5 h-3.5" />
                            {member.invite_email}
                          </span>
                        )}
                        {member.invite_phone && (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Phone className="w-3.5 h-3.5" />
                            {member.invite_phone}
                          </span>
                        )}
                        {member.hourly_rate > 0 && (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Star className="w-3.5 h-3.5" />
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
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
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
                            onClick={() => { handleDeleteManual(member.id); setOpenMenuId(null); }}
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
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
