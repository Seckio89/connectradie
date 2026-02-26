import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import type { Profile, TradieDetails } from '../types/database';

interface UserWithDetails extends Profile {
  tradie_details: TradieDetails[] | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, tradie_details(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data as unknown as UserWithDetails[]);
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

  const handleTogglePremium = async (userId: string, currentValue: boolean) => {
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
      showToast(`Premium ${!currentValue ? 'enabled' : 'disabled'} successfully`);
    }
    setActionLoading(null);
    setConfirmModal(null);
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    setActionLoading(userId);
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      showToast('Failed to update role', true);
    } else {
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, role: newRole as Profile['role'] } : u))
      );
      showToast(`Role changed to ${newRole} successfully`);
    }
    setActionLoading(null);
    setConfirmModal(null);
  };

  const getVerificationBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      unverified: 'bg-gray-100 text-gray-600',
      expired: 'bg-orange-100 text-orange-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  const getRoleBadge = (role: string | null) => {
    const map: Record<string, string> = {
      client: 'bg-blue-100 text-blue-700',
      tradie: 'bg-indigo-100 text-indigo-700',
      admin: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[role || ''] || 'bg-gray-100 text-gray-600'}`}>
        {role || 'unknown'}
      </span>
    );
  };

  const getSubscriptionBadge = (tier: string) => {
    if (tier === 'pro') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pro</span>;
    if (tier === 'business') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Business</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Free</span>;
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-1">
              {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="client">Client</option>
                <option value="tradie">Tradie</option>
                <option value="admin">Admin</option>
              </select>
              <select
                value={verificationFilter}
                onChange={e => setVerificationFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No users found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredUsers.map(user => {
                const isExpanded = expandedId === user.id;
                const td = user.tradie_details?.[0];

                return (
                  <div key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      className="w-full text-left p-5 flex items-center gap-4"
                    >
                      <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{user.full_name || 'Unknown'}</h3>
                          {getRoleBadge(user.role)}
                          {getVerificationBadge(user.verification_status)}
                          {td && getSubscriptionBadge(td.subscription_tier)}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                      <div className="hidden sm:block text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString('en-AU')}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5">
                        <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                          {/* Profile Details */}
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Mail className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Phone className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Phone</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{user.phone || '--'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <MapPin className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Address</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900 truncate">{user.address || '--'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Joined</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">
                                {new Date(user.created_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Crown className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Premium</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{user.is_premium ? 'Yes' : 'No'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Onboarded</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{user.onboarding_completed ? 'Yes' : 'No'}</p>
                            </div>
                          </div>

                          {/* Tradie Details */}
                          {td && (
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                              <div className="flex items-center gap-2 mb-3">
                                <Briefcase className="w-4 h-4 text-indigo-600" />
                                <span className="font-medium text-gray-900">Tradie Details</span>
                              </div>
                              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-500">Business:</span>{' '}
                                  <span className="font-medium text-gray-900">{td.business_name}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Trade:</span>{' '}
                                  <span className="font-medium text-gray-900">{td.trade_category}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Type:</span>{' '}
                                  <span className="font-medium text-gray-900">{td.contractor_type}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Verified:</span>{' '}
                                  <span className="font-medium text-gray-900">{td.is_verified ? 'Yes' : 'No'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Insured:</span>{' '}
                                  <span className="font-medium text-gray-900">{td.is_insured ? 'Yes' : 'No'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Tier:</span>{' '}
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
                              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                                user.is_premium
                                  ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                                  : 'bg-amber-600 text-white hover:bg-amber-700'
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
                                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                              >
                                <BadgeCheck className="w-4 h-4" />
                                Change to {user.role === 'client' ? 'Tradie' : 'Client'}
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
          )}
        </div>
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

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.isError ? 'error' : 'success'}
          onClose={hideToast}
        />
      )}
    </DashboardLayout>
  );
}
