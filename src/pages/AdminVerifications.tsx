import { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  FileText,
  Hash,
  Calendar,
  ExternalLink,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import type { Profile } from '../types/database';

interface PendingUser extends Profile {
  expanded?: boolean;
}

export default function AdminVerifications() {
  const [, /* pendingUsers */ setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'declined'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['tradie', 'admin'])
      .neq('verification_status', 'unverified')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAllUsers(data);
    }
    setLoading(false);
  };

  const getFilteredUsersByTab = () => {
    let filtered = allUsers;

    switch (activeTab) {
      case 'pending':
        filtered = allUsers.filter(u => u.verification_status === 'pending');
        break;
      case 'approved':
        filtered = allUsers.filter(u => u.verification_status === 'verified');
        break;
      case 'declined':
        filtered = allUsers.filter(u => u.verification_status === 'rejected');
        break;
    }

    return filtered;
  };

  const tabUsers = getFilteredUsersByTab();

  const filteredUsers = searchQuery
    ? tabUsers.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.abn_number?.includes(searchQuery) ||
          u.license_number?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tabUsers;

  const pendingCount = allUsers.filter((u) => u.verification_status === 'pending').length;
  const approvedCount = allUsers.filter((u) => u.verification_status === 'verified').length;
  const declinedCount = allUsers.filter((u) => u.verification_status === 'rejected').length;

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);

    const user = allUsers.find(u => u.id === userId);
    const licenseTrades = (user as any)?.license_trades || [];
    const declaredTrades = (user as any)?.declared_trades || [];
    const existingVerified = (user as any)?.verified_trades || [];
    const merged = Array.from(new Set([...existingVerified, ...licenseTrades, ...declaredTrades]));

    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: 'verified',
        rejection_reason: null,
        verified_trades: merged,
        license_verified: true,
      })
      .eq('id', userId);

    if (!error) {
      await supabase
        .from('tradie_details')
        .update({ is_verified: true })
        .eq('profile_id', userId);
    }

    if (error) {
      alert('Failed to approve verification. Please check your permissions.');
    } else {
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, verification_status: 'verified', rejection_reason: null, verified_trades: merged, license_verified: true } as any
            : u
        )
      );
      setExpandedId(null);
    }

    setActionLoading(null);
  };

  const handleReject = async (userId: string) => {
    const reason = rejectReason[userId]?.trim();
    if (!reason) return;

    setActionLoading(userId);

    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: 'rejected',
        rejection_reason: reason,
        license_verified: false,
      })
      .eq('id', userId);

    if (!error) {
      await supabase
        .from('tradie_details')
        .update({ is_verified: false })
        .eq('profile_id', userId);
    }

    if (error) {
      alert('Failed to reject verification. Please check your permissions.');
    } else {
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, verification_status: 'rejected', rejection_reason: reason }
            : u
        )
      );
      setShowRejectInput(null);
      setExpandedId(null);
    }

    setActionLoading(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Pending</span>;
      case 'verified':
        return <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Verified</span>;
      case 'rejected':
        return <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Rejected</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Unverified</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Verification Center</h1>
            <p className="text-gray-600 mt-1">Review and manage tradie verification requests</p>
          </div>
          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">{pendingCount} pending</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'pending'
                    ? 'text-amber-700 bg-amber-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Pending</span>
                  {pendingCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'pending'
                        ? 'bg-amber-200 text-amber-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {pendingCount}
                    </span>
                  )}
                </div>
                {activeTab === 'pending' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600"></div>
                )}
              </button>

              <button
                onClick={() => setActiveTab('approved')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'approved'
                    ? 'text-green-700 bg-green-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approved</span>
                  {approvedCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'approved'
                        ? 'bg-green-200 text-green-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {approvedCount}
                    </span>
                  )}
                </div>
                {activeTab === 'approved' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600"></div>
                )}
              </button>

              <button
                onClick={() => setActiveTab('declined')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'declined'
                    ? 'text-red-700 bg-red-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" />
                  <span>Declined</span>
                  {declinedCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'declined'
                        ? 'bg-red-200 text-red-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {declinedCount}
                    </span>
                  )}
                </div>
                {activeTab === 'declined' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600"></div>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, ABN, or license..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center">
              {activeTab === 'pending' && <Clock className="w-12 h-12 text-amber-300 mx-auto mb-3" />}
              {activeTab === 'approved' && <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />}
              {activeTab === 'declined' && <XCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />}
              <p className="text-gray-500 font-medium">
                {searchQuery ? 'No matching records found' : `No ${activeTab} verifications`}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {!searchQuery && activeTab === 'pending' && 'All caught up! No pending verifications.'}
                {!searchQuery && activeTab === 'approved' && 'No approved tradies yet.'}
                {!searchQuery && activeTab === 'declined' && 'No declined verifications.'}
                {searchQuery && 'Try adjusting your search query.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredUsers.map((user) => {
                const isExpanded = expandedId === user.id;

                return (
                  <div key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      className="w-full text-left p-5 flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{user.full_name || 'Unknown'}</h3>
                          {getStatusBadge(user.verification_status)}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
                        {user.abn_number && (
                          <div className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            <span>ABN: {user.abn_number}</span>
                          </div>
                        )}
                        {user.license_number && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            <span>{user.license_number}</span>
                          </div>
                        )}
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
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">ABN</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{user.abn_number || '--'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Hash className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">License</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{user.license_number || '--'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">License Expiry</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">
                                {user.license_expiry
                                  ? new Date(user.license_expiry + 'T00:00:00').toLocaleDateString('en-AU')
                                  : '--'}
                              </p>
                            </div>
                          </div>

                          {(user as any).license_trades && (user as any).license_trades.length > 0 && (
                            <div className="bg-white rounded-lg p-3 border border-gray-200 sm:col-span-2 lg:col-span-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 uppercase">Trades Covered by License</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {(user as any).license_trades.map((trade: string) => (
                                  <span
                                    key={trade}
                                    className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200"
                                  >
                                    {trade}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {user.documents_url && user.documents_url.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded Documents</h4>
                              <div className="flex flex-wrap gap-2">
                                {user.documents_url.map((url, idx) => (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Document {idx + 1}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {user.verification_status === 'verified' && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <p className="text-sm text-green-700">
                                <span className="font-medium">Verified</span> - This tradie has been approved and verified.
                              </p>
                            </div>
                          )}

                          {user.rejection_reason && user.verification_status === 'rejected' && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-red-700">
                                <span className="font-medium">Rejection reason:</span> {user.rejection_reason}
                              </p>
                            </div>
                          )}

                          {user.verification_status === 'pending' && (
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                              <button
                                onClick={() => handleApprove(user.id)}
                                disabled={actionLoading === user.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {actionLoading === user.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                Approve
                              </button>

                              {showRejectInput === user.id ? (
                                <div className="flex-1 space-y-2">
                                  <textarea
                                    value={rejectReason[user.id] || ''}
                                    onChange={(e) =>
                                      setRejectReason((prev) => ({ ...prev, [user.id]: e.target.value }))
                                    }
                                    placeholder="Enter rejection reason..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm resize-none"
                                    rows={2}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleReject(user.id)}
                                      disabled={!rejectReason[user.id]?.trim() || actionLoading === user.id}
                                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {actionLoading === user.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        'Confirm Reject'
                                      )}
                                    </button>
                                    <button
                                      onClick={() => setShowRejectInput(null)}
                                      className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowRejectInput(user.id)}
                                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors"
                                >
                                  <XCircle className="w-4 h-4" />
                                  Reject
                                </button>
                              )}
                            </div>
                          )}
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
    </DashboardLayout>
  );
}
