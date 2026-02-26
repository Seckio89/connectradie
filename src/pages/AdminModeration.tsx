import { useState, useEffect } from 'react';
import {
  Flag,
  Search,
  Loader2,
  Star,
  Trash2,
  MessageSquare,
  Briefcase,
  User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
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

export default function AdminModeration() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reviews' | 'jobs'>('reviews');
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [reviewsRes, jobsRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('*, client:profiles!reviews_client_id_fkey(full_name), tradie:profiles!reviews_tradie_id_fkey(full_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select('*, client_profile:profiles!jobs_client_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    setReviews((reviewsRes.data as unknown as ReviewRow[]) || []);
    setJobs((jobsRes.data as unknown as JobRow[]) || []);
    setLoading(false);
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

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      accepted: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-indigo-100 text-indigo-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-100 text-gray-600',
      declined: 'bg-red-100 text-red-700',
      funded: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Content Moderation</h1>
          <p className="text-gray-600 mt-1">Review and moderate platform content</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => { setActiveTab('reviews'); setSearchQuery(''); }}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'reviews'
                    ? 'text-amber-700 bg-amber-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>Reviews</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'reviews' ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {reviews.length}
                  </span>
                </div>
                {activeTab === 'reviews' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />
                )}
              </button>
              <button
                onClick={() => { setActiveTab('jobs'); setSearchQuery(''); }}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'jobs'
                    ? 'text-indigo-700 bg-indigo-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>Job Listings</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'jobs' ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {jobs.length}
                  </span>
                </div>
                {activeTab === 'jobs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : activeTab === 'reviews' ? (
            <>
              {/* Review Filters */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search reviews by name or content..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <select
                    value={ratingFilter}
                    onChange={e => setRatingFilter(e.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No reviews found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {searchQuery || ratingFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No reviews have been submitted yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredReviews.map(review => (
                    <div key={review.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-900">
                              {review.client?.full_name || 'Anonymous'}
                            </span>
                            <span className="text-gray-400">&rarr;</span>
                            <span className="font-medium text-gray-700">
                              {review.tradie?.full_name || 'Unknown Tradie'}
                            </span>
                            <span className="text-sm text-gray-500">{formatDate(review.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-1 mb-2">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>

                          {review.comment && (
                            <p className="text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                          )}
                        </div>

                        <button
                          onClick={() => setDeleteReviewId(review.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
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
                <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No job listings found</p>
                <p className="text-sm text-gray-400 mt-1">No jobs have been posted yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <div key={job.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {job.description?.slice(0, 120)}{(job.description?.length || 0) > 120 ? '...' : ''}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
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
