import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect } from 'react';
import { friendlyError } from '../lib/utils';
import {
  Users,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  Crown,
  ShieldCheck,
  BadgeCheck,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Trash2,
  X,
  AlertTriangle,
  Send,
  UserCheck,
  Ban,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAdminAction } from '../lib/auditLog';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import type { Profile, TradieDetails } from '../types/database';

const REMOVAL_REASONS = [
  'Providing false information (fake licenses, ABN, or reviews)',
  'Harassment or unprofessional behaviour toward other users',
  'Repeated non-compliance with platform policies',
  'Fraudulent or suspicious account activity',
  'Violation of Terms of Service',
  'Other (please specify below)',
];

interface RemoveUserModalProps {
  userName: string;
  userEmail: string;
  loading: boolean;
  onConfirm: (reason: string, message: string) => void;
  onCancel: () => void;
}

function RemoveUserModal({ userName, userEmail, loading, onConfirm, onCancel }: RemoveUserModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const canSubmit = selectedReason && (selectedReason !== 'Other (please specify below)' || customMessage.trim().length > 0);

  const handleSubmit = () => {
    const reason = selectedReason === 'Other (please specify below)' ? customMessage.trim() : selectedReason;
    onConfirm(reason, customMessage.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[70] p-4 animate-fade-in">
      <div className="bg-ct-surface rounded-ct-lg max-w-lg w-full shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-ct-rose/[0.13] rounded-full flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-ct-rose" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ct-paper">Remove User</h3>
                <p className="text-sm text-ct-mute mt-0.5">{userName} ({userEmail})</p>
              </div>
            </div>
            <button onClick={onCancel} className="p-1 text-ct-mute hover:text-ct-mute-2 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-ct-mute-2 mb-4">
            Select a reason for removal. The user will receive a notification email explaining why their account was removed and how to dispute the decision.
          </p>

          {/* Reason selector */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-ct-mute-2 mb-1.5">Reason for removal</label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-rose text-sm bg-ct-surface-2 focus:bg-ct-surface"
            >
              <option value="">Select a reason...</option>
              {REMOVAL_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>

          {/* Additional message */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-ct-mute-2 mb-1.5">
              Additional message to user {selectedReason !== 'Other (please specify below)' && <span className="font-normal text-ct-mute">(optional)</span>}
            </label>
            <textarea {...proseInputProps}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
              placeholder="Provide additional context or details for the user..."
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-rose text-sm bg-ct-surface-2 focus:bg-ct-surface resize-none"
            />
          </div>

          {/* Preview */}
          {selectedReason && (
            <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md p-4 mb-4">
              <p className="text-xs font-semibold text-ct-rose uppercase mb-2">Email preview to user</p>
              <div className="text-sm text-ct-paper space-y-2">
                <p>Hi {userName},</p>
                <p>
                  Your ConnecTradie account has been removed for the following reason:
                </p>
                <p className="font-medium italic">
                  "{selectedReason === 'Other (please specify below)' ? (customMessage.trim() || '...') : selectedReason}"
                </p>
                {customMessage.trim() && selectedReason !== 'Other (please specify below)' && (
                  <p>Additional note: "{customMessage.trim()}"</p>
                )}
                <p>
                  If you believe this was a mistake, you can dispute this decision by emailing{' '}
                  <span className="font-medium underline">admin@connectradie.com</span> with your account details and reason for dispute.
                </p>
              </div>
            </div>
          )}

          <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md p-3 mb-5">
            <p className="text-xs text-ct-amber">
              This action is permanent. The user's profile, tradie details, and associated data will be deleted and cannot be recovered.
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-ct-surface-2 text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-line transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="flex-1 px-4 py-3 bg-ct-rose text-ct-ink rounded-ct-md font-medium hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Remove & Notify User
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UserWithDetails extends Profile {
  tradie_details: TradieDetails[] | null;
}

interface AccountRemoval {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  reason: string;
  additional_message: string;
  removed_at: string;
  reinstated_at: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [verificationFilter, setVerificationFilter] = useState<string>('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'role' | 'premium';
    userId: string;
    value: string;
  } | null>(null);
  const [removeModal, setRemoveModal] = useState<{
    userId: string;
    userName: string;
    userEmail: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'removed'>('active');
  const [removedUsers, setRemovedUsers] = useState<AccountRemoval[]>([]);
  const [removedLoading, setRemovedLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*, tradie_details(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (!error && data) {
      setUsers(data as unknown as UserWithDetails[]);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const filteredUsers = users.filter(user => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !user.full_name?.toLowerCase().includes(q) &&
        !user.email?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (verificationFilter !== 'all' && user.verification_status !== verificationFilter) return false;
    if (subscriptionFilter !== 'all') {
      const td = user.tradie_details?.[0];
      const tier = td?.subscription_tier || 'free';
      if (tier !== subscriptionFilter) return false;
    }
    return true;
  });

  const handleTogglePremium = async (userId: string, currentValue: boolean | null) => {
    setActionLoading(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_premium: !currentValue })
      .eq('id', userId);

    if (error) {
      showToast('Failed to update premium status', true);
    } else {
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, is_premium: !currentValue } : u))
      );
      await logAdminAction('toggle_premium', 'user', userId, { new_value: !currentValue });
      showToast(`Premium ${!currentValue ? 'enabled' : 'disabled'} successfully`);
    }
    setActionLoading(null);
    setConfirmModal(null);
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole as Profile['role'] })
      .eq('id', userId);

    if (error) {
      showToast('Failed to update role', true);
    } else {
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, role: newRole as Profile['role'] } : u))
      );
      await logAdminAction('change_role', 'user', userId, { new_role: newRole });
      showToast(`Role changed to ${newRole} successfully`);
    }
    setActionLoading(null);
    setConfirmModal(null);
  };

  const handleRemoveUser = async (userId: string, reason: string, additionalMessage: string) => {
    setActionLoading(userId);

    try {
      const user = users.find(u => u.id === userId);

      // Store removal audit trail in account_removals table (no FK to profiles, survives cascade)
      const { error: removalError } = await supabase.from('account_removals').insert({
        user_id: userId,
        email: user?.email || '',
        full_name: user?.full_name || '',
        reason,
        additional_message: additionalMessage || '',
        removed_at: new Date().toISOString(),
      });
      if (removalError) console.error('Failed to record account removal:', removalError);

      // Delete related tradie_details first (uses profile_id column), then the profile
      // ON DELETE CASCADE handles most related records automatically
      const { error: tradieError } = await supabase.from('tradie_details').delete().eq('profile_id', userId);
      if (tradieError) console.error('Failed to delete tradie details:', tradieError);

      const { error } = await supabase.from('profiles').delete().eq('id', userId);

      if (error) {
        showToast(friendlyError(error, 'Unable to remove this user. They may have linked data that needs to be handled first.'), true);
      } else {
        setUsers(prev => prev.filter(u => u.id !== userId));
        await logAdminAction('delete_user', 'user', userId, { reason, email: user?.email });
        showToast(`User removed. Notification sent to ${user?.email || 'user'}.`);
        setExpandedId(null);
      }
    } catch (err) {
      console.error('Failed to remove user:', err);
      showToast('Failed to remove user. Please try again.', true);
    }
    setActionLoading(null);
    setRemoveModal(null);
  };

  const fetchRemovedUsers = async () => {
    setRemovedLoading(true);
    try {
      const { data, error } = await supabase
        .from('account_removals')
        .select('*')
        .is('reinstated_at', null)
        .order('removed_at', { ascending: false });
      if (error) throw error;
      setRemovedUsers((data as unknown as AccountRemoval[]) || []);
    } catch (err) {
      console.error('Failed to fetch removed users:', err);
    }
    setRemovedLoading(false);
  };

  const handleReinstateUser = async (removal: AccountRemoval) => {
    setActionLoading(removal.id);

    try {
      // Recreate the user's profile
      const { error: insertError } = await supabase.from('profiles').insert({
        id: removal.user_id,
        email: removal.email,
        full_name: removal.full_name || removal.email.split('@')[0],
        role: 'client',
        onboarding_completed: false,
        verification_status: 'unverified',
        is_premium: false,
      });

      if (insertError) {
        showToast('Failed to reinstate user: ' + insertError.message, true);
        setActionLoading(null);
        return;
      }

      // Mark the removal record as reinstated
      const { error: updateError } = await supabase
        .from('account_removals')
        .update({ reinstated_at: new Date().toISOString() })
        .eq('id', removal.id);
      if (updateError) console.error('Failed to mark removal as reinstated:', updateError);

      setRemovedUsers(prev => prev.filter(r => r.id !== removal.id));
      showToast(`${removal.full_name || removal.email} has been reinstated. They can now log in again.`);
    } catch (err) {
      console.error('Failed to reinstate user:', err);
      showToast('Failed to reinstate user. Please try again.', true);
    }
    setActionLoading(null);
  };

  const getVerificationBadge = (status: string | null) => {
    const map: Record<string, string> = {
      pending: 'bg-ct-amber/[0.13] text-ct-amber',
      verified: 'bg-ct-teal/[0.14] text-ct-teal',
      rejected: 'bg-ct-rose/[0.13] text-ct-rose',
      unverified: 'bg-ct-surface-2 text-ct-mute-2',
      expired: 'bg-ct-amber/[0.13] text-ct-amber',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${(status && map[status]) || 'bg-ct-surface-2 text-ct-mute-2'}`}>
        {status?.replace(/_/g, ' ')}
      </span>
    );
  };

  const getRoleBadge = (role: string | null) => {
    const map: Record<string, string> = {
      client: 'bg-ct-surface-2 text-ct-mute-2',
      tradie: 'bg-ct-amber/[0.13] text-ct-amber',
      admin: 'bg-ct-amber/[0.13] text-ct-amber',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${map[role || ''] || 'bg-ct-surface-2 text-ct-mute-2'}`}>
        {role || 'unknown'}
      </span>
    );
  };

  const getSubscriptionBadge = (tier: string | null) => {
    if (tier === 'pro') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-amber/[0.13] text-ct-amber">Pro</span>;
    if (tier === 'business') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-amber/[0.13] text-ct-amber">Business</span>;
    return <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute-2">Free</span>;
  };

  return (
    <DashboardLayout wide>
      <SectionErrorBoundary>
      <Breadcrumbs />
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">User Management</h1>
            <p className="text-ct-mute-2 mt-1">
              {activeTab === 'active'
                ? `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} found`
                : `${removedUsers.length} removed account${removedUsers.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-ct-surface-2 rounded-ct-md p-1 mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-ct-sm text-sm font-medium transition-colors ${
              activeTab === 'active'
                ? 'bg-ct-surface text-ct-paper shadow-sm'
                : 'text-ct-mute hover:text-ct-mute-2'
            }`}
          >
            <Users className="w-4 h-4" />
            Active Users
          </button>
          <button
            onClick={() => { setActiveTab('removed'); fetchRemovedUsers(); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-ct-sm text-sm font-medium transition-colors ${
              activeTab === 'removed'
                ? 'bg-ct-surface text-ct-paper shadow-sm'
                : 'text-ct-mute hover:text-ct-mute-2'
            }`}
          >
            <Ban className="w-4 h-4" />
            Removed Users
          </button>
        </div>

        {/* Removed Users Tab */}
        {activeTab === 'removed' ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
            {removedLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-ct-mute animate-spin" />
              </div>
            ) : removedUsers.length === 0 ? (
              <div className="text-center py-16">
                <UserCheck className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                <p className="text-ct-mute font-medium">No removed users</p>
                <p className="text-ct-mute text-sm mt-1">All disputes have been resolved</p>
              </div>
            ) : (
              <div className="divide-y divide-ct-line-soft">
                {removedUsers.map((removal) => (
                  <div key={removal.id} className="p-5 hover:bg-ct-surface-2 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-ct-rose/[0.13] rounded-full flex items-center justify-center flex-shrink-0">
                          <Ban className="w-5 h-5 text-ct-rose" />
                        </div>
                        <div>
                          <p className="font-semibold text-ct-paper">
                            {removal.full_name || 'Unknown User'}
                          </p>
                          <p className="text-sm text-ct-mute break-words">{removal.email}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-sm text-ct-rose">
                              <span className="font-medium">Reason:</span> {removal.reason}
                            </p>
                            {removal.additional_message && (
                              <p className="text-sm text-ct-mute">
                                <span className="font-medium">Details:</span> {removal.additional_message}
                              </p>
                            )}
                            <p className="text-xs text-ct-mute">
                              Removed {new Date(removal.removed_at).toLocaleDateString('en-AU', {
                                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleReinstateUser(removal)}
                        disabled={actionLoading === removal.id}
                        className="flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 transition-colors flex-shrink-0"
                      >
                        {actionLoading === removal.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                        Reinstate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (

        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-ct-line-soft space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              >
                <option value="all">All Roles</option>
                <option value="client">Client</option>
                <option value="tradie">Tradie</option>
                <option value="admin">Admin</option>
              </select>
              <select
                value={verificationFilter}
                onChange={e => setVerificationFilter(e.target.value)}
                className="px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              >
                <option value="all">All Verification</option>
                <option value="unverified">Unverified</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                value={subscriptionFilter}
                onChange={e => setSubscriptionFilter(e.target.value)}
                className="px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              >
                <option value="all">All Subscriptions</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>

          {/* Users List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-12 h-12 text-ct-mute mx-auto mb-3" />
              <p className="text-ct-mute font-medium">No users found</p>
              <p className="text-sm text-ct-mute mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3 p-4">
              {filteredUsers.map(user => {
                const td = user.tradie_details?.[0];
                return (
                  <div key={user.id} className="bg-ct-surface border border-ct-line rounded-ct-md p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-ct-md object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-ct-mute-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-ct-paper text-sm">{user.full_name || 'Unknown'}</h3>
                        <p className="text-xs text-ct-mute truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getRoleBadge(user.role)}
                      {getVerificationBadge(user.verification_status)}
                      {td && getSubscriptionBadge(td.subscription_tier)}
                    </div>
                    <div className="text-xs text-ct-mute">
                      Joined {new Date(user.created_at).toLocaleDateString('en-AU')}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-ct-line-soft">
                      <button
                        onClick={() =>
                          setConfirmModal({
                            type: 'premium',
                            userId: user.id,
                            value: String(!user.is_premium),
                          })
                        }
                        disabled={actionLoading === user.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ct-sm font-medium text-xs transition-colors ${
                          user.is_premium
                            ? 'border border-ct-amber/[0.34] text-ct-amber hover:bg-ct-amber/[0.13]'
                            : 'bg-ct-teal text-ct-ink hover:bg-ct-teal'
                        }`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        {user.is_premium ? 'Remove Premium' : 'Grant Premium'}
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          onClick={() =>
                            setConfirmModal({
                              type: 'role',
                              userId: user.id,
                              value: user.role === 'client' ? 'tradie' : 'client',
                            })
                          }
                          disabled={actionLoading === user.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ct-line text-ct-mute-2 rounded-ct-sm font-medium text-xs hover:bg-ct-surface-2 transition-colors"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" />
                          To {user.role === 'client' ? 'Tradie' : 'Client'}
                        </button>
                      )}
                      {user.role !== 'admin' && (
                        <button
                          onClick={() =>
                            setRemoveModal({
                              userId: user.id,
                              userName: user.full_name || 'Unknown',
                              userEmail: user.email || '',
                            })
                          }
                          disabled={actionLoading === user.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ct-rose/[0.34] text-ct-rose rounded-ct-sm font-medium text-xs hover:bg-ct-rose/[0.13] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop List View */}
            <div className="hidden md:block divide-y divide-ct-line-soft">
              {filteredUsers.map(user => {
                const isExpanded = expandedId === user.id;
                const td = user.tradie_details?.[0];

                return (
                  <div key={user.id} className="hover:bg-ct-surface-2/50 transition-colors">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      className="w-full text-left p-5 flex items-center gap-4"
                    >
                      <div className="w-11 h-11 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-11 h-11 rounded-ct-md object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-ct-mute-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-ct-paper">{user.full_name || 'Unknown'}</h3>
                          {getRoleBadge(user.role)}
                          {getVerificationBadge(user.verification_status)}
                          {td && getSubscriptionBadge(td.subscription_tier)}
                        </div>
                        <p className="text-sm text-ct-mute truncate">{user.email}</p>
                      </div>
                      <div className="hidden sm:block text-sm text-ct-mute">
                        {new Date(user.created_at).toLocaleDateString('en-AU')}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-ct-mute flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-ct-mute flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5">
                        <div className="bg-ct-surface-2 rounded-ct-md p-5 space-y-4">
                          {/* Profile Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Mail className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Email</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper truncate">{user.email}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Phone className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Phone</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">{user.phone || '--'}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <MapPin className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Address</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper truncate">{user.address || '--'}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Joined</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">
                                {new Date(user.created_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Crown className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Premium</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">{user.is_premium ? 'Yes' : 'No'}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Onboarded</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">{user.onboarding_completed ? 'Yes' : 'No'}</p>
                            </div>
                          </div>

                          {/* Tradie Details */}
                          {td && (
                            <div className="bg-ct-surface rounded-ct-sm p-4 border border-ct-line">
                              <div className="flex items-center gap-2 mb-3">
                                <Briefcase className="w-4 h-4 text-ct-mute-2" />
                                <span className="font-medium text-ct-paper">Tradie Details</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                                <div>
                                  <span className="text-ct-mute">Business:</span>{' '}
                                  <span className="font-medium text-ct-paper">{td.business_name}</span>
                                </div>
                                <div>
                                  <span className="text-ct-mute">Trade:</span>{' '}
                                  <span className="font-medium text-ct-paper">{td.trade_category}</span>
                                </div>
                                <div>
                                  <span className="text-ct-mute">Type:</span>{' '}
                                  <span className="font-medium text-ct-paper">{td.contractor_type}</span>
                                </div>
                                <div>
                                  <span className="text-ct-mute">Verified:</span>{' '}
                                  <span className="font-medium text-ct-paper">{td.is_verified ? 'Yes' : 'No'}</span>
                                </div>
                                <div>
                                  <span className="text-ct-mute">Insured:</span>{' '}
                                  <span className="font-medium text-ct-paper">{td.is_insured ? 'Yes' : 'No'}</span>
                                </div>
                                <div>
                                  <span className="text-ct-mute">Tier:</span>{' '}
                                  {getSubscriptionBadge(td.subscription_tier)}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-wrap gap-3 pt-2">
                            <button
                              onClick={() =>
                                setConfirmModal({
                                  type: 'premium',
                                  userId: user.id,
                                  value: String(!user.is_premium),
                                })
                              }
                              disabled={actionLoading === user.id}
                              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-ct-md font-medium text-sm transition-colors ${
                                user.is_premium
                                  ? 'border border-ct-amber/[0.34] text-ct-amber hover:bg-ct-amber/[0.13]'
                                  : 'bg-ct-teal text-ct-ink hover:bg-ct-teal'
                              }`}
                            >
                              <Crown className="w-4 h-4" />
                              {user.is_premium ? 'Remove Premium' : 'Grant Premium'}
                            </button>

                            {user.role !== 'admin' && (
                              <button
                                onClick={() =>
                                  setConfirmModal({
                                    type: 'role',
                                    userId: user.id,
                                    value: user.role === 'client' ? 'tradie' : 'client',
                                  })
                                }
                                disabled={actionLoading === user.id}
                                className="inline-flex items-center gap-2 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-md font-medium text-sm hover:bg-ct-surface-2 transition-colors"
                              >
                                <BadgeCheck className="w-4 h-4" />
                                Change to {user.role === 'client' ? 'Tradie' : 'Client'}
                              </button>
                            )}

                            {user.role !== 'admin' && (
                              <button
                                onClick={() =>
                                  setRemoveModal({
                                    userId: user.id,
                                    userName: user.full_name || 'Unknown',
                                    userEmail: user.email || '',
                                  })
                                }
                                disabled={actionLoading === user.id}
                                className="inline-flex items-center gap-2 px-4 py-2.5 border border-ct-rose/[0.34] text-ct-rose rounded-ct-md font-medium text-sm hover:bg-ct-rose/[0.13] transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove User
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-6 px-4">
              <p className="text-sm text-ct-mute-2">
                Showing {((page-1)*pageSize)+1}-{Math.min(page*pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm disabled:opacity-50 hover:bg-ct-surface-2">Previous</button>
                <span className="text-sm font-medium text-ct-mute-2">Page {page}</span>
                <button disabled={page * pageSize >= totalCount} onClick={() => setPage(p => p+1)} className="px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm disabled:opacity-50 hover:bg-ct-surface-2">Next</button>
              </div>
            </div>
            </>
          )}
        </div>

        )}
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.type === 'premium' ? 'Toggle Premium Status' : 'Change User Role'}
          message={
            confirmModal.type === 'premium'
              ? `Are you sure you want to ${confirmModal.value === 'true' ? 'grant' : 'remove'} premium access for this user?`
              : `Are you sure you want to change this user's role to ${confirmModal.value}? This will affect their permissions and dashboard experience.`
          }
          confirmText={confirmModal.type === 'premium' ? 'Confirm' : `Change to ${confirmModal.value}`}
          type={confirmModal.type === 'premium' ? 'warning' : 'info'}
          onConfirm={() => {
            if (confirmModal.type === 'premium') {
              const user = users.find(u => u.id === confirmModal.userId);
              if (user) handleTogglePremium(user.id, user.is_premium);
            } else {
              handleChangeRole(confirmModal.userId, confirmModal.value);
            }
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {removeModal && (
        <RemoveUserModal
          userName={removeModal.userName}
          userEmail={removeModal.userEmail}
          loading={actionLoading === removeModal.userId}
          onConfirm={(reason, message) => handleRemoveUser(removeModal.userId, reason, message)}
          onCancel={() => setRemoveModal(null)}
        />
      )}

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.isError ? 'error' : 'success'}
          onClose={hideToast}
        />
      )}
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}
