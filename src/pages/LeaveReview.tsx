import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Star, CheckCircle2, ChevronRight, MapPin, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { releaseEscrow } from '../lib/stripePayments';
import DashboardLayout from '../components/DashboardLayout';

const REVIEW_TAGS = [
  { key: 'punctual', label: 'Punctual' },
  { key: 'quality_work', label: 'Quality Work' },
  { key: 'good_communication', label: 'Good Communication' },
  { key: 'fair_pricing', label: 'Fair Pricing' },
  { key: 'clean_worksite', label: 'Clean Worksite' },
  { key: 'professional', label: 'Professional' },
  { key: 'experienced', label: 'Experienced' },
  { key: 'reliable', label: 'Reliable' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'would_recommend', label: 'Would Recommend' },
] as const;

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

interface JobInfo {
  id: string;
  description: string;
  location_address: string | null;
  status: string;
  client_id: string;
  tradie_id: string | null;
  created_at: string;
  tradie?: { full_name: string; avatar_url: string | null; id: string } | null;
}

export default function LeaveReview() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [paymentReleased, setPaymentReleased] = useState(false);
  const [alreadyReleased, setAlreadyReleased] = useState(false);

  useEffect(() => {
    if (!jobId || !user) return;

    const fetchJob = async () => {
      setLoading(true);
      try {
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('id, description, location_address, status, client_id, tradie_id, created_at')
          .eq('id', jobId)
          .maybeSingle();

        if (jobError || !jobData) {
          setError('Job not found.');
          setLoading(false);
          return;
        }

        if (jobData.client_id !== user.id) {
          setError('You can only review jobs you posted.');
          setLoading(false);
          return;
        }

        let tradieInfo = null;
        if (jobData.tradie_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', jobData.tradie_id)
            .maybeSingle();
          tradieInfo = profile;
        }

        setJob({ ...jobData, tradie: tradieInfo });

        // Check if already reviewed
        const { data: existingReview } = await supabase
          .from('reviews')
          .select('id')
          .eq('job_id', jobId)
          .eq('client_id', user.id)
          .maybeSingle();

        if (existingReview) {
          setAlreadyReviewed(true);
        }

        // Check if payment is already released
        const { data: payment } = await supabase
          .from('payments')
          .select('id, metadata')
          .eq('job_id', jobId)
          .eq('payment_type', 'job_funding')
          .eq('status', 'completed')
          .maybeSingle();
        if (payment) {
          const meta = payment.metadata as Record<string, unknown> | null;
          if (meta?.transfer_id) {
            setAlreadyReleased(true);
          }
        }
      } catch {
        setError('Failed to load job details.');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId, user]);

  const extractCategory = (description: string) => {
    const match = description.match(/^\[([^\]]+)\]/);
    return match ? match[1] : null;
  };

  const cleanDescription = (description: string) => {
    return description.replace(/^\[[^\]]+\]\s*/, '');
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please select a rating.');
      return;
    }

    if (!job || !job.tradie_id || !user) return;

    setIsSubmitting(true);
    setError('');

    try {
      const reviewComment = [
        comment.trim(),
        selectedTags.length > 0 ? `[Tags: ${selectedTags.join(', ')}]` : '',
      ].filter(Boolean).join('\n');

      // Release escrow payment if not already released
      if (!alreadyReleased) {
        const { data: payment } = await supabase
          .from('payments')
          .select('id, metadata')
          .eq('job_id', job.id)
          .eq('payment_type', 'job_funding')
          .eq('status', 'completed')
          .maybeSingle();
        if (payment) {
          const meta = payment.metadata as Record<string, unknown> | null;
          if (!meta?.transfer_id) {
            await releaseEscrow(payment.id);
            setPaymentReleased(true);
          }
        }
      }

      const { error: insertError } = await supabase
        .from('reviews')
        .insert({
          job_id: job.id,
          tradie_id: job.tradie_id,
          client_id: user.id,
          rating,
          comment: reviewComment || null,
        });

      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !job) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-12 text-center">
          <p className="text-gray-600 mb-4">{error}</p>
          <Link to="/payments" className="text-primary-600 hover:text-primary-700 font-medium text-sm">
            Back to Payments
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) return null;

  const category = extractCategory(job.description);
  const desc = cleanDescription(job.description);
  const tradieName = job.tradie?.full_name || 'Your Tradie';
  const tradieInitial = tradieName.charAt(0).toUpperCase();
  const displayRating = hoveredRating || rating;

  // Success state
  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-warm-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-warm-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Review Submitted{paymentReleased ? ' & Payment Released' : ''}</h1>
            <p className="text-sm text-gray-600 mb-1">
              Thank you for reviewing <span className="font-semibold">{tradieName}</span>.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {paymentReleased
                ? 'Your feedback has been recorded and payment has been released to your tradie.'
                : 'Your feedback helps other clients find quality tradies.'}
            </p>

            <div className="flex items-center justify-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-6 h-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                />
              ))}
              <span className="ml-2 text-sm font-medium text-gray-700">{RATING_LABELS[rating]}</span>
            </div>

            <div className="flex gap-3">
              <Link
                to="/payments"
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors text-center"
              >
                View Payments
              </Link>
              <Link
                to="/dashboard"
                className="flex-1 px-4 py-2.5 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 transition-colors text-center"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Already reviewed state
  if (alreadyReviewed) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-gray-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Already Reviewed</h1>
            <p className="text-sm text-gray-600 mb-6">
              You've already submitted a review for this job. Thank you for your feedback!
            </p>
            <Link
              to="/payments"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 transition-colors"
            >
              Back to Payments
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link to="/payments" className="hover:text-gray-600 transition-colors">Payments</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-800 font-medium">Leave a Review</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-lg font-bold text-gray-900 mb-1">Rate Your Experience</h1>
            <p className="text-sm text-gray-500">Help other clients by sharing your experience.</p>
          </div>

          <div className="h-px bg-gray-100 mx-6" />

          {/* Tradie Info Card */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 p-3 bg-surface-50 border border-surface-200 rounded-lg">
              {job.tradie?.avatar_url ? (
                <img src={job.tradie.avatar_url} alt={tradieName} className="w-11 h-11 rounded-full object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 font-bold text-lg">{tradieInitial}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{tradieName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {category && (
                    <span className="px-2 py-0.5 bg-secondary-50 text-secondary-700 rounded text-xs font-medium border border-secondary-200">
                      {category}
                    </span>
                  )}
                  {job.location_address && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      {job.location_address.split(',')[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Job description */}
            <p className="text-sm text-gray-600 mt-3 line-clamp-2">{desc}</p>
          </div>

          <div className="h-px bg-gray-100 mx-6" />

          {/* Review Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Star Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        star <= displayRating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
                {displayRating > 0 && (
                  <span className="ml-2 text-sm font-medium text-gray-600">{RATING_LABELS[displayRating]}</span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">What stood out? <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="flex flex-wrap gap-2">
                {REVIEW_TAGS.map(tag => {
                  const isSelected = selectedTags.includes(tag.key);
                  return (
                    <button
                      key={tag.key}
                      type="button"
                      onClick={() => toggleTag(tag.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-warm-50 text-warm-700 border-warm-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      {isSelected && <span className="mr-1">&#10003;</span>}
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label htmlFor="review-comment" className="block text-sm font-medium text-gray-700 mb-2">
                Review <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-transparent resize-none placeholder-gray-400"
                placeholder="Tell others about your experience with this tradie..."
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Payment release info */}
            {!alreadyReleased && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <p className="text-xs text-emerald-700">
                  Submitting your review will also release the payment to your tradie.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Skip for Now
              </button>
              <button
                type="submit"
                disabled={isSubmitting || rating === 0}
                className="flex-1 px-4 py-2.5 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Submitting...' : alreadyReleased ? 'Submit Review' : 'Submit Review & Release Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
