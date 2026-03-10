import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type DisputeStatus = 'open' | 'under_review' | 'resolved_client' | 'resolved_tradie' | 'resolved_split' | 'dismissed';

interface Dispute {
  id: string;
  job_id: string;
  opened_by: string;
  against_user: string;
  reason: string;
  description: string;
  evidence_urls: string[];
  status: DisputeStatus;
  admin_notes: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  opener_name?: string;
  against_name?: string;
  job_description?: string;
}

const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  resolved_client: 'Resolved (Client)',
  resolved_tradie: 'Resolved (Tradie)',
  resolved_split: 'Resolved (Split)',
  dismissed: 'Dismissed',
};

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  resolved_client: 'bg-green-100 text-green-800',
  resolved_tradie: 'bg-green-100 text-green-800',
  resolved_split: 'bg-purple-100 text-purple-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'resolved', label: 'Resolved' },
] as const;

type FilterTab = (typeof FILTER_TABS)[number]['key'];

export default function AdminDisputes() {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    setLoading(true);

    const { data: disputesData, error } = await supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !disputesData) {
      setLoading(false);
      return;
    }

    // Fetch related profiles and jobs
    const openerIds = [...new Set(disputesData.map((d) => d.opened_by))];
    const againstIds = [...new Set(disputesData.map((d) => d.against_user))];
    const allUserIds = [...new Set([...openerIds, ...againstIds])];
    const jobIds = [...new Set(disputesData.map((d) => d.job_id))];

    const [profilesRes, jobsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', allUserIds),
      supabase.from('jobs').select('id, description').in('id', jobIds),
    ]);

    const profileMap = new Map(
      (profilesRes.data || []).map((p) => [p.id, p.full_name])
    );
    const jobMap = new Map(
      (jobsRes.data || []).map((j) => [j.id, j.description])
    );

    const enriched: Dispute[] = disputesData.map((d) => ({
      ...d,
      opener_name: profileMap.get(d.opened_by) || 'Unknown User',
      against_name: profileMap.get(d.against_user) || 'Unknown User',
      job_description: jobMap.get(d.job_id) || 'Unknown Job',
    }));

    setDisputes(enriched);
    setLoading(false);
  };

  const updateDisputeStatus = async (disputeId: string, newStatus: DisputeStatus) => {
    if (!user) return;
    setUpdating(disputeId);

    const notes = adminNotes[disputeId] || null;
    const isResolution = newStatus.startsWith('resolved_') || newStatus === 'dismissed';

    const updateData: Record<string, unknown> = {
      status: newStatus,
      admin_notes: notes,
      updated_at: new Date().toISOString(),
    };

    if (isResolution) {
      updateData.resolved_by = user.id;
      updateData.resolved_at = new Date().toISOString();
      updateData.resolution = notes;
    }

    const { error } = await supabase
      .from('disputes')
      .update(updateData)
      .eq('id', disputeId);

    if (!error) {
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === disputeId
            ? {
                ...d,
                status: newStatus,
                admin_notes: notes,
                ...(isResolution
                  ? {
                      resolved_by: user.id,
                      resolved_at: new Date().toISOString(),
                      resolution: notes,
                    }
                  : {}),
              }
            : d
        )
      );
    }

    setUpdating(null);
  };

  const filteredDisputes = disputes.filter((d) => {
    // Filter by tab
    if (filter === 'open' && d.status !== 'open') return false;
    if (filter === 'under_review' && d.status !== 'under_review') return false;
    if (
      filter === 'resolved' &&
      !['resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed'].includes(d.status)
    )
      return false;

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.reason.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.opener_name?.toLowerCase().includes(q) ||
        d.against_name?.toLowerCase().includes(q) ||
        d.job_description?.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const getStatusIcon = (status: DisputeStatus) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="w-4 h-4" />;
      case 'under_review':
        return <Eye className="w-4 h-4" />;
      case 'resolved_client':
      case 'resolved_tradie':
      case 'resolved_split':
        return <CheckCircle className="w-4 h-4" />;
      case 'dismissed':
        return <XCircle className="w-4 h-4" />;
    }
  };

  return (
    <DashboardLayout>
      <Breadcrumbs />
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dispute Resolution</h1>
            <p className="text-gray-600 mt-1">Review and resolve disputes between users</p>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>
              {disputes.filter((d) => d.status === 'open').length} open dispute
              {disputes.filter((d) => d.status === 'open').length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search and filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search disputes by reason, user, or job..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>

            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Disputes list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : filteredDisputes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Disputes Found</h3>
            <p className="text-gray-500">
              {filter === 'all'
                ? 'There are no disputes in the system yet.'
                : `No disputes with status "${FILTER_TABS.find((t) => t.key === filter)?.label}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDisputes.map((dispute) => {
              const isExpanded = expandedId === dispute.id;

              return (
                <div
                  key={dispute.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : dispute.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            STATUS_COLORS[dispute.status]
                          }`}
                        >
                          {getStatusIcon(dispute.status)}
                          {STATUS_LABELS[dispute.status]}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{dispute.reason}</span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        Job: {dispute.job_description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          Filed by: <strong>{dispute.opener_name}</strong>
                        </span>
                        <span>
                          Against: <strong>{dispute.against_name}</strong>
                        </span>
                        <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-5 space-y-5">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Full Description</h4>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">
                          {dispute.description}
                        </p>
                      </div>

                      {dispute.evidence_urls && dispute.evidence_urls.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Evidence</h4>
                          <div className="space-y-1.5">
                            {dispute.evidence_urls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {url.length > 60 ? url.substring(0, 60) + '...' : url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {dispute.admin_notes && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">
                            Previous Admin Notes
                          </h4>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                            {dispute.admin_notes}
                          </p>
                        </div>
                      )}

                      {dispute.resolution && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Resolution</h4>
                          <p className="text-sm text-gray-600 bg-green-50 rounded-lg p-3">
                            {dispute.resolution}
                          </p>
                        </div>
                      )}

                      {/* Admin actions */}
                      {!['resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed'].includes(
                        dispute.status
                      ) && (
                        <div className="border-t border-gray-100 pt-5">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Admin Actions</h4>

                          <div className="mb-4">
                            <label
                              htmlFor={`notes-${dispute.id}`}
                              className="block text-sm font-medium text-gray-600 mb-1.5"
                            >
                              Admin Notes / Resolution
                            </label>
                            <textarea
                              id={`notes-${dispute.id}`}
                              value={adminNotes[dispute.id] || ''}
                              onChange={(e) =>
                                setAdminNotes((prev) => ({ ...prev, [dispute.id]: e.target.value }))
                              }
                              rows={3}
                              placeholder="Add notes about the investigation or resolution..."
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none text-sm"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {dispute.status === 'open' && (
                              <button
                                onClick={() => updateDisputeStatus(dispute.id, 'under_review')}
                                disabled={updating === dispute.id}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                              >
                                {updating === dispute.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                                Mark Under Review
                              </button>
                            )}

                            <button
                              onClick={() => updateDisputeStatus(dispute.id, 'resolved_client')}
                              disabled={updating === dispute.id}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {updating === dispute.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Resolve for Client
                            </button>

                            <button
                              onClick={() => updateDisputeStatus(dispute.id, 'resolved_tradie')}
                              disabled={updating === dispute.id}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              {updating === dispute.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Resolve for Tradie
                            </button>

                            <button
                              onClick={() => updateDisputeStatus(dispute.id, 'dismissed')}
                              disabled={updating === dispute.id}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              {updating === dispute.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
