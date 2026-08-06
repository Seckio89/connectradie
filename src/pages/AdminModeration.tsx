import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect } from 'react';
import {
  Search,
  Loader2,
  Star,
  Trash2,
  MessageSquare,
  Briefcase,
  User,
  Flag,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client: { full_name: string } | null;
  tradie: { full_name: string } | null;
}

interface JobRow {
  id: string;
  description: string;
  status: string;
  created_at: string;
  client_profile: { full_name: string } | null;
}

interface FlaggedJobRow {
  id: string;
  title: string | null;
  description: string;
  status: string;
  contact_flagged: boolean;
  contact_flag_reason: string | null;
  created_at: string;
  client_profile: { full_name: string } | null;
}

interface AbuseReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  description: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reporter: { full_name: string } | null;
  reported_user: { full_name: string } | null;
}

export default function AdminModeration() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [flaggedJobs, setFlaggedJobs] = useState<FlaggedJobRow[]>([]);
  const [activeTab, setActiveTab] = useState<'reports' | 'flagged' | 'reviews' | 'jobs'>('reports');
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('pending');
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [fetchError, setFetchError] = useState('');
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setFetchError('');
      setLoading(true);
      const [reviewsRes, jobsRes, reportsRes, flaggedRes] = await Promise.all([
        supabase
          .from('reviews')
          .select('*, client:profiles!reviews_client_id_fkey(full_name), tradie:profiles!reviews_tradie_id_fkey(full_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('*, client_profile:profiles!jobs_client_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('abuse_reports')
          .select('*, reporter:profiles!abuse_reports_reporter_id_fkey(full_name), reported_user:profiles!abuse_reports_reported_user_id_fkey(full_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('*, client_profile:profiles!jobs_client_id_fkey(full_name)')
          .eq('contact_flagged', true)
          .order('created_at', { ascending: false }),
      ]);

      if (reviewsRes.error) throw reviewsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (reportsRes.error) throw reportsRes.error;

      setReviews((reviewsRes.data as unknown as ReviewRow[]) || []);
      setJobs((jobsRes.data as unknown as JobRow[]) || []);
      setReports((reportsRes.data as unknown as AbuseReport[]) || []);
      setFlaggedJobs((flaggedRes.data as unknown as FlaggedJobRow[]) || []);
      setLoading(false);
    } catch {
      setFetchError('Failed to load data. Please try again.');
      setLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);

    if (error) {
      showToast('Failed to delete review', true);
    } else {
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      showToast('Review deleted successfully');
    }
    setDeleteReviewId(null);
  };

  const handleReportAction = async (reportId: string, newStatus: 'resolved' | 'dismissed' | 'warned') => {
    const notes = adminNotes[reportId] || '';
    const { error } = await supabase
      .from('abuse_reports')
      .update({
        status: newStatus,
        admin_notes: notes || null,
        // These columns existed but were never written — record who actioned it.
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq('id', reportId);

    if (error) {
      showToast('Failed to update report', true);
    } else {
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus, admin_notes: notes || null } : r));
      showToast(`Report ${newStatus === 'warned' ? 'warning issued' : newStatus}`);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const filteredReviews = reviews.filter(review => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !review.client?.full_name?.toLowerCase().includes(q) &&
        !review.tradie?.full_name?.toLowerCase().includes(q) &&
        !review.comment?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (ratingFilter !== 'all' && review.rating !== Number(ratingFilter)) return false;
    return true;
  });

  const filteredReports = reports.filter(report => {
    if (reportStatusFilter !== 'all' && report.status !== reportStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !report.reporter?.full_name?.toLowerCase().includes(q) &&
        !report.reported_user?.full_name?.toLowerCase().includes(q) &&
        !report.description?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const pendingReportsCount = reports.filter(r => r.status === 'pending').length;

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-ct-amber/[0.13] text-ct-amber',
      accepted: 'bg-ct-surface-2 text-ct-mute-2',
      in_progress: 'bg-ct-amber/[0.13] text-ct-amber',
      completed: 'bg-ct-teal/[0.14] text-ct-teal',
      cancelled: 'bg-ct-surface-2 text-ct-mute-2',
      declined: 'bg-ct-rose/[0.13] text-ct-rose',
      funded: 'bg-ct-amber/[0.13] text-ct-amber',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-ct-surface-2 text-ct-mute-2'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getReportStatusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; icon: typeof Clock; label: string }> = {
      pending: { bg: 'bg-ct-amber/[0.13] text-ct-amber', icon: Clock, label: 'Pending' },
      resolved: { bg: 'bg-ct-teal/[0.14] text-ct-teal', icon: CheckCircle2, label: 'Resolved' },
      dismissed: { bg: 'bg-ct-surface-2 text-ct-mute-2', icon: XCircle, label: 'Dismissed' },
      warned: { bg: 'bg-ct-rose/[0.13] text-ct-rose', icon: AlertTriangle, label: 'Warning Issued' },
    };
    const c = cfg[status] || cfg.pending;
    const Icon = c.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${c.bg}`}>
        <Icon className="w-3 h-3" />
        {c.label}
      </span>
    );
  };

  const getReportTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      harassment: 'Harassment',
      fraud: 'Fraud',
      fake_review: 'Fake Review',
      inappropriate_content: 'Inappropriate',
      spam: 'Spam',
      other: 'Other',
    };
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-rose/[0.13] text-ct-rose border border-ct-rose/[0.34]">
        {labels[type] || type.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <DashboardLayout wide>
      <Breadcrumbs />
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ct-paper">Content Moderation</h1>
          <p className="text-ct-mute-2 mt-1">Review and moderate platform content, manage abuse reports</p>
        </div>

        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-ct-line overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex min-w-max">
              <button
                onClick={() => { setActiveTab('reports'); setSearchQuery(''); }}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'reports'
                    ? 'text-ct-rose bg-ct-rose/[0.13]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Flag className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Abuse Reports</span>
                  <span className="sm:hidden">Reports</span>
                  {pendingReportsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-ct-rose/[0.13] text-ct-rose">
                      {pendingReportsCount}
                    </span>
                  )}
                </div>
                {activeTab === 'reports' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-rose" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('flagged'); setSearchQuery(''); }}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'flagged'
                    ? 'text-ct-teal bg-ct-teal/[0.14]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Flagged Jobs</span>
                  <span className="sm:hidden">Flagged</span>
                  {flaggedJobs.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-ct-amber/[0.13] text-ct-amber">
                      {flaggedJobs.length}
                    </span>
                  )}
                </div>
                {activeTab === 'flagged' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('reviews'); setSearchQuery(''); }}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'reviews'
                    ? 'text-ct-teal bg-ct-teal/[0.14]'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span>Reviews</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'reviews' ? 'bg-ct-teal/[0.14] text-ct-paper' : 'bg-ct-line text-ct-mute-2'
                  }`}>
                    {reviews.length}
                  </span>
                </div>
                {activeTab === 'reviews' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('jobs'); setSearchQuery(''); }}
                className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all relative whitespace-nowrap ${
                  activeTab === 'jobs'
                    ? 'text-ct-mute-2 bg-ct-surface-2/50'
                    : 'text-ct-mute-2 hover:text-ct-paper hover:bg-ct-surface-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Job Listings</span>
                  <span className="sm:hidden">Jobs</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'jobs' ? 'bg-ct-teal/[0.14] text-ct-teal' : 'bg-ct-line text-ct-mute-2'
                  }`}>
                    {jobs.length}
                  </span>
                </div>
                {activeTab === 'jobs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal" />
                )}
              </button>
            </div>
          </div>

          {fetchError ? (
            <div className="bg-ct-surface rounded-ct-lg border border-ct-rose/[0.34] p-12 text-center">
              <AlertCircle className="w-12 h-12 text-ct-rose mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-ct-paper mb-2">Failed to Load</h3>
              <p className="text-ct-mute-2 mb-4">{fetchError}</p>
              <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
            </div>
          ) : activeTab === 'reports' ? (
            <>
              {/* Report Filters */}
              <div className="p-4 border-b border-ct-line-soft">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search reports by name or description..."
                      className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm"
                    />
                  </div>
                  <select
                    value={reportStatusFilter}
                    onChange={e => setReportStatusFilter(e.target.value)}
                    className="px-3 py-2.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="warned">Warned</option>
                  </select>
                </div>
              </div>

              {filteredReports.length === 0 ? (
                <div className="py-16 text-center">
                  <Flag className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute font-medium">No abuse reports found</p>
                  <p className="text-sm text-ct-mute mt-1">
                    {reportStatusFilter !== 'all' || searchQuery
                      ? 'Try adjusting your filters'
                      : 'No abuse reports have been submitted'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-ct-line-soft">
                  {filteredReports.map(report => (
                    <div key={report.id} className={`p-5 ${report.status === 'pending' ? 'bg-ct-rose/[0.13]' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-ct-rose/[0.13] rounded-ct-md flex items-center justify-center flex-shrink-0">
                          <Flag className="w-5 h-5 text-ct-rose" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold text-ct-paper">
                              {report.reporter?.full_name || 'Anonymous'}
                            </span>
                            <span className="text-ct-mute">reported</span>
                            <span className="font-medium text-ct-rose">
                              {report.reported_user?.full_name || 'Unknown User'}
                            </span>
                            <span className="text-sm text-ct-mute">{formatDate(report.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            {getReportTypeBadge(report.report_type)}
                            {getReportStatusBadge(report.status)}
                          </div>

                          <p className="text-ct-mute-2 text-sm leading-relaxed mb-3">{report.description}</p>

                          {report.admin_notes && report.status !== 'pending' && (
                            <div className="bg-ct-surface-2 rounded-ct-sm p-3 mb-3">
                              <p className="text-xs text-ct-mute font-medium mb-1">Admin Notes</p>
                              <p className="text-sm text-ct-mute-2">{report.admin_notes}</p>
                            </div>
                          )}

                          {report.status === 'pending' && (
                            <div className="space-y-3">
                              <textarea {...proseInputProps}
                                value={adminNotes[report.id] || ''}
                                onChange={e => setAdminNotes(prev => ({ ...prev, [report.id]: e.target.value }))}
                                placeholder="Add admin notes (optional)..."
                                rows={2}
                                className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleReportAction(report.id, 'resolved')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Resolve
                                </button>
                                <button
                                  onClick={() => handleReportAction(report.id, 'warned')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-ct-rose text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 transition-colors"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Issue Warning
                                </button>
                                <button
                                  onClick={() => handleReportAction(report.id, 'dismissed')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-ct-surface-2 text-ct-mute-2 rounded-ct-sm text-xs font-medium hover:bg-ct-line transition-colors"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : activeTab === 'flagged' ? (
            <div className="p-4">
              {flaggedJobs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-10 h-10 text-ct-teal mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-ct-paper mb-1">No flagged jobs</h3>
                  <p className="text-xs text-ct-mute">All job descriptions look clean.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {flaggedJobs.map(job => {
                    const category = job.description.match(/^\[([^\]]+)\]/)?.[1] || '';
                    const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
                    return (
                      <div key={job.id} className="border border-ct-amber/[0.34] bg-ct-amber/[0.13] rounded-ct-md p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-ct-paper">{job.title || category || 'Untitled'}</h4>
                              {category && <span className="px-3 py-1 bg-ct-surface-2 text-ct-mute-2 rounded-full text-xs font-medium">{category}</span>}
                              <span className="px-3 py-1 bg-ct-amber/[0.13] text-ct-amber rounded-full text-xs font-medium border border-ct-amber/[0.34]">Flagged</span>
                            </div>
                            <p className="text-sm text-ct-mute-2 mb-2">{desc}</p>
                            <div className="flex items-center gap-3 text-xs text-ct-mute">
                              <span><User className="w-3 h-3 inline mr-1" />{job.client_profile?.full_name || 'Unknown'}</span>
                              <span><Clock className="w-3 h-3 inline mr-1" />{new Date(job.created_at).toLocaleDateString('en-AU')}</span>
                              <span className="px-2 py-0.5 bg-ct-surface-2 rounded-ct-xs text-xs capitalize">{job.status?.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-ct-amber/[0.34]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-ct-amber">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="font-medium">Reason:</span>
                              <span>{job.contact_flag_reason || 'Contact info detected'}</span>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const { error } = await supabase.from('jobs').update({ contact_flagged: false, contact_flag_reason: null }).eq('id', job.id);
                                  if (error) throw error;
                                  setFlaggedJobs(prev => prev.filter(j => j.id !== job.id));
                                  showToast('Flag dismissed');
                                } catch (err) {
                                  console.error('Failed to dismiss flag:', err);
                                  showToast('Failed to dismiss flag', true);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ct-mute-2 hover:text-ct-paper bg-ct-surface border border-ct-line hover:border-ct-line rounded-ct-sm transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Dismiss Flag
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'reviews' ? (
            <>
              {/* Review Filters */}
              <div className="p-4 border-b border-ct-line-soft">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search reviews by name or content..."
                      className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm"
                    />
                  </div>
                  <select
                    value={ratingFilter}
                    onChange={e => setRatingFilter(e.target.value)}
                    className="px-3 py-2.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  >
                    <option value="all">All Ratings</option>
                    <option value="5">5 Stars</option>
                    <option value="4">4 Stars</option>
                    <option value="3">3 Stars</option>
                    <option value="2">2 Stars</option>
                    <option value="1">1 Star</option>
                  </select>
                </div>
              </div>

              {filteredReviews.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute font-medium">No reviews found</p>
                  <p className="text-sm text-ct-mute mt-1">
                    {searchQuery || ratingFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No reviews have been submitted yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-ct-line-soft">
                  {filteredReviews.map(review => (
                    <div key={review.id} className="p-5 hover:bg-ct-surface-2/50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-ct-amber/[0.13] rounded-ct-md flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-ct-amber" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-ct-paper">
                              {review.client?.full_name || 'Anonymous'}
                            </span>
                            <span className="text-ct-mute">&rarr;</span>
                            <span className="font-medium text-ct-mute-2">
                              {review.tradie?.full_name || 'Unknown Tradie'}
                            </span>
                            <span className="text-sm text-ct-mute">{formatDate(review.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-1 mb-2">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
                                    ? 'fill-ct-amber text-ct-amber'
                                    : 'text-ct-mute'
                                }`}
                              />
                            ))}
                          </div>

                          {review.comment && (
                            <p className="text-ct-mute-2 text-sm leading-relaxed">{review.comment}</p>
                          )}
                        </div>

                        <button
                          onClick={() => setDeleteReviewId(review.id)}
                          className="p-2 text-ct-mute hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors flex-shrink-0"
                          title="Delete review"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Jobs Tab */
            jobs.length === 0 ? (
              <div className="py-16 text-center">
                <Briefcase className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                <p className="text-ct-mute font-medium">No job listings found</p>
                <p className="text-sm text-ct-mute mt-1">No jobs have been posted yet</p>
              </div>
            ) : (
              <div className="divide-y divide-ct-line-soft">
                {jobs.map(job => (
                  <div key={job.id} className="p-5 hover:bg-ct-surface-2/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ct-paper mb-1">
                          {job.description?.slice(0, 120)}{(job.description?.length || 0) > 120 ? '...' : ''}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-ct-mute">
                          <span>{job.client_profile?.full_name || 'Unknown'}</span>
                          <span>&middot;</span>
                          <span>{formatDate(job.created_at)}</span>
                        </div>
                      </div>
                      {getStatusBadge(job.status)}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {deleteReviewId && (
        <ConfirmModal
          title="Delete Review"
          message="Are you sure you want to permanently delete this review? This action cannot be undone."
          confirmText="Delete"
          type="danger"
          onConfirm={() => handleDeleteReview(deleteReviewId)}
          onCancel={() => setDeleteReviewId(null)}
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
