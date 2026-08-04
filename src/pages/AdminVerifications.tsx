import { proseInputProps } from '../lib/proseInput';
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
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import type { Profile } from '../types/database';
import { getSignedUrl } from '../lib/storage';

interface PendingUser extends Profile {
  expanded?: boolean;
}

export default function AdminVerifications() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'declined'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setFetchError('');
      setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['tradie', 'admin'])
        .neq('verification_status', 'unverified')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setAllUsers(data as PendingUser[]);
      }
      setLoading(false);
    } catch {
      setFetchError('Failed to load data. Please try again.');
      setLoading(false);
    }
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
    const licenseTrades = user?.license_trades || [];
    const declaredTrades = user?.declared_trades || [];
    const existingVerified = user?.verified_trades || [];
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
            ? { ...u, verification_status: 'verified' as const, rejection_reason: null, verified_trades: merged, license_verified: true }
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

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 bg-ct-amber/[0.13] text-ct-amber rounded-full text-xs font-medium">Pending</span>;
      case 'verified':
        return <span className="px-3 py-1 bg-ct-teal/[0.14] text-ct-teal rounded-full text-xs font-medium">Verified</span>;
      case 'rejected':
        return <span className="px-3 py-1 bg-ct-rose/[0.13] text-ct-rose rounded-full text-xs font-medium">Rejected</span>;
      default:
        return <span className="px-3 py-1 bg-ct-surface-2 text-ct-mute-2 rounded-full text-xs font-medium">Unverified</span>;
    }
  };

  return (
    <DashboardLayout wide>
      <Breadcrumbs />
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">Verification Center</h1>
            <p className="text-ct-mute-2 mt-1">Review and manage tradie verification requests</p>
          </div>
          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md">
              <Clock className="w-4 h-4 text-ct-amber" />
              <span className="text-sm font-semibold text-ct-paper">{pendingCount} pending</span>
            </div>
          )}
        </div>

        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-ct-line overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex min-w-max">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'pending'
                    ? 'text-ct-teal bg-ct-teal/[0.14]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>Pending</span>
                  {pendingCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'pending'
                        ? 'bg-ct-teal/[0.14] text-ct-teal'
                        : 'bg-ct-line text-ct-mute-2'
                    }`}>
                      {pendingCount}
                    </span>
                  )}
                </div>
                {activeTab === 'pending' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal"></div>
                )}
              </button>

              <button
                onClick={() => setActiveTab('approved')}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'approved'
                    ? 'text-ct-teal bg-ct-teal/[0.14]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Approved</span>
                  {approvedCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'approved'
                        ? 'bg-ct-teal/[0.14] text-ct-teal'
                        : 'bg-ct-line text-ct-mute-2'
                    }`}>
                      {approvedCount}
                    </span>
                  )}
                </div>
                {activeTab === 'approved' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal"></div>
                )}
              </button>

              <button
                onClick={() => setActiveTab('declined')}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'declined'
                    ? 'text-ct-rose bg-ct-rose/[0.13]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Declined</span>
                  {declinedCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'declined'
                        ? 'bg-ct-rose/[0.13] text-ct-paper'
                        : 'bg-ct-line text-ct-mute-2'
                    }`}>
                      {declinedCount}
                    </span>
                  )}
                </div>
                {activeTab === 'declined' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-rose"></div>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-ct-line-soft">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, ABN, or license..."
                className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm"
              />
            </div>
          </div>

          {fetchError ? (
            <div className="bg-ct-surface rounded-ct-lg border border-ct-rose/[0.34] p-12 text-center">
              <AlertCircle className="w-12 h-12 text-ct-rose mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-ct-paper mb-2">Failed to Load</h3>
              <p className="text-ct-mute-2 mb-4">{fetchError}</p>
              <button onClick={fetchUsers} className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center">
              {activeTab === 'pending' && <Clock className="w-12 h-12 text-ct-teal mx-auto mb-3" />}
              {activeTab === 'approved' && <CheckCircle2 className="w-12 h-12 text-ct-teal mx-auto mb-3" />}
              {activeTab === 'declined' && <XCircle className="w-12 h-12 text-ct-rose mx-auto mb-3" />}
              <p className="text-ct-mute font-medium">
                {searchQuery ? 'No matching records found' : `No ${activeTab} verifications`}
              </p>
              <p className="text-sm text-ct-mute mt-1">
                {!searchQuery && activeTab === 'pending' && 'All caught up! No pending verifications.'}
                {!searchQuery && activeTab === 'approved' && 'No approved tradies yet.'}
                {!searchQuery && activeTab === 'declined' && 'No declined verifications.'}
                {searchQuery && 'Try adjusting your search query.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-ct-line-soft">
              {filteredUsers.map((user) => {
                const isExpanded = expandedId === user.id;

                return (
                  <div key={user.id} className="hover:bg-ct-surface-2/50 transition-colors">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      className="w-full text-left p-5 flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-ct-md object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-ct-mute-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-ct-paper">{user.full_name || 'Unknown'}</h3>
                          {getStatusBadge(user.verification_status)}
                        </div>
                        <p className="text-sm text-ct-mute truncate">{user.email}</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-4 text-sm text-ct-mute">
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
                        <ChevronUp className="w-5 h-5 text-ct-mute flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-ct-mute flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5">
                        <div className="bg-ct-surface-2 rounded-ct-md p-5 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">ABN</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">{user.abn_number || '--'}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Hash className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">License</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">{user.license_number || '--'}</p>
                            </div>
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line">
                              <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">License Expiry</span>
                              </div>
                              <p className="text-sm font-medium text-ct-paper">
                                {user.license_expiry
                                  ? new Date(user.license_expiry + 'T00:00:00').toLocaleDateString('en-AU')
                                  : '--'}
                              </p>
                            </div>
                          </div>

                          {user.license_trades && user.license_trades.length > 0 && (
                            <div className="bg-ct-surface rounded-ct-sm p-3 border border-ct-line sm:col-span-2 lg:col-span-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-ct-mute" />
                                <span className="text-xs font-medium text-ct-mute uppercase">Trades Covered by License</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {user.license_trades.map((trade: string) => (
                                  <span
                                    key={trade}
                                    className="px-2.5 py-1 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-full border border-ct-line"
                                  >
                                    {trade}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {user.documents_url && user.documents_url.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-ct-mute-2 mb-2">Uploaded Documents</h4>
                              <div className="flex flex-wrap gap-2">
                                {user.documents_url.map((value, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={async () => {
                                      const signed = await getSignedUrl('documents', value, 600);
                                      if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-ct-surface border border-ct-line rounded-ct-sm text-sm text-ct-mute-2 hover:bg-ct-surface-2 hover:border-ct-line transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Document {idx + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {user.verification_status === 'verified' && (
                            <div className="p-3 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-ct-teal flex-shrink-0" />
                              <p className="text-sm text-ct-teal">
                                <span className="font-medium">Verified</span> - This tradie has been approved and verified.
                              </p>
                            </div>
                          )}

                          {user.rejection_reason && user.verification_status === 'rejected' && (
                            <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-ct-rose">
                                <span className="font-medium">Rejection reason:</span> {user.rejection_reason}
                              </p>
                            </div>
                          )}

                          {user.verification_status === 'pending' && (
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                              <button
                                onClick={() => handleApprove(user.id)}
                                disabled={actionLoading === user.id}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-teal text-ct-ink font-medium rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                  <textarea {...proseInputProps}
                                    value={rejectReason[user.id] || ''}
                                    onChange={(e) =>
                                      setRejectReason((prev) => ({ ...prev, [user.id]: e.target.value }))
                                    }
                                    placeholder="Enter rejection reason..."
                                    className="w-full px-3 py-2 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-rose text-sm resize-none"
                                    rows={2}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleReject(user.id)}
                                      disabled={!rejectReason[user.id]?.trim() || actionLoading === user.id}
                                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-ct-rose text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {actionLoading === user.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        'Confirm Reject'
                                      )}
                                    </button>
                                    <button
                                      onClick={() => setShowRejectInput(null)}
                                      className="px-3 py-2 border border-ct-line text-ct-mute-2 text-sm font-medium rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowRejectInput(user.id)}
                                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-rose/[0.34] text-ct-rose font-medium rounded-ct-md hover:bg-ct-rose/[0.13] transition-colors"
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
