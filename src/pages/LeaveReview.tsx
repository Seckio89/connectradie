import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Star, CheckCircle2, ChevronRight, MapPin, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { proseInputProps } from '../lib/proseInput';
import { useAuth } from '../contexts/AuthContext';
import { releaseEscrow, humanizePaymentError } from '../lib/stripePayments';
import { isReleaseActioned } from '../lib/paymentRelease';
import DashboardLayout from '../components/DashboardLayout';

const REVIEW_TAGS = [
  { key: 'punctual', label: 'Punctual' },
  { key: 'quality_work', label: 'Quality work' },
  { key: 'good_communication', label: 'Good communication' },
  { key: 'fair_pricing', label: 'Fair pricing' },
  { key: 'clean_worksite', label: 'Clean worksite' },
  { key: 'professional', label: 'Professional' },
  { key: 'experienced', label: 'Experienced' },
  { key: 'reliable', label: 'Reliable' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'would_recommend', label: 'Would recommend' },
] as const;

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

interface JobInfo {
  id: string;
  description: string;
  location_address: string | null;
  status: string | null;
  client_id: string | null;
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
  const [releaseError, setReleaseError] = useState('');

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
          if (isReleaseActioned({ metadata: meta })) {
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

      // The review goes in FIRST, and the release is not allowed to take it down
      // with it. These ran the other way around, so any escrow error — a $0 job
      // with no Stripe payment intent was the one that surfaced it — threw before
      // the insert and silently discarded feedback the client had already
      // written. Their rating is not collateral for a payment problem.
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

      // Release escrow payment if not already released
      if (!alreadyReleased) {
        try {
          const { data: payment } = await supabase
            .from('payments')
            .select('id, metadata')
            .eq('job_id', job.id)
            .eq('payment_type', 'job_funding')
            .eq('status', 'completed')
            .maybeSingle();
          if (payment) {
            const meta = payment.metadata as Record<string, unknown> | null;
            // Only release if the client hasn't already actioned it. Without this,
            // submitting a review on an approved-but-still-settling payout called
            // release-escrow a SECOND time.
            if (!isReleaseActioned({ metadata: meta })) {
              await releaseEscrow(payment.id);
              setPaymentReleased(true);
            }
          }
        } catch (releaseErr: unknown) {
          // Non-fatal: the review is already saved. Say what failed and where to
          // retry rather than pretending the payment went out.
          setReleaseError(
            humanizePaymentError(
              releaseErr instanceof Error ? releaseErr.message : null,
            ),
          );
        }
      }

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
          <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !job) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-12 text-center">
          <p className="text-ct-mute-2 mb-4">{error}</p>
          <Link to="/payments" className="text-ct-mute-2 hover:text-ct-mute-2 font-medium text-sm">
            Back to payments
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) return null;

  const category = extractCategory(job.description);
  const desc = cleanDescription(job.description);
  const tradieName = job.tradie?.full_name || 'Your tradie';
  const tradieInitial = tradieName.charAt(0).toUpperCase();
  const displayRating = hoveredRating || rating;

  // Success state
  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-12">
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-8 text-center">
            <div className="w-16 h-16 bg-ct-teal/[0.14] rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-ct-teal" />
            </div>
            <h1 className="text-xl font-bold text-ct-paper mb-2">Review submitted{paymentReleased ? ' & payment released' : ''}</h1>
            <p className="text-sm text-ct-mute-2 mb-1">
              Thank you for reviewing <span className="font-semibold">{tradieName}</span>.
            </p>
            <p className="text-sm text-ct-mute mb-6">
              {paymentReleased
                ? 'Your feedback has been recorded and payment has been released to your tradie.'
                : 'Your feedback helps other clients find quality tradies.'}
            </p>

            <div className="flex items-center justify-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`w-6 h-6 ${star <= rating ? 'fill-ct-amber text-ct-amber' : 'text-ct-mute'}`}
                />
              ))}
              <span className="ml-2 text-sm font-medium text-ct-mute-2">{RATING_LABELS[rating]}</span>
            </div>

            {releaseError && (
              <div className="p-3 mb-6 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm text-left">
                <p className="text-sm text-ct-rose font-medium mb-1">Payment wasn't released</p>
                <p className="text-xs text-ct-mute-2">
                  {releaseError} Your review is saved — release the payment from Payments when you're ready.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Link
                to="/payments"
                className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 transition-colors text-center whitespace-nowrap"
              >
                View payments
              </Link>
              <Link
                to="/dashboard"
                className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-semibold hover:brightness-110 transition-colors text-center whitespace-nowrap"
              >
                Back to dashboard
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
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-8 text-center">
            <div className="w-16 h-16 bg-ct-surface-2 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-ct-mute" />
            </div>
            <h1 className="text-xl font-bold text-ct-paper mb-2">Already reviewed</h1>
            <p className="text-sm text-ct-mute-2 mb-6">
              You've already submitted a review for this job. Thank you for your feedback!
            </p>
            <Link
              to="/payments"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-semibold hover:brightness-110 transition-colors"
            >
              Back to payments
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
        <nav className="flex items-center gap-1.5 text-xs text-ct-mute mb-4">
          <Link to="/payments" className="hover:text-ct-mute-2 transition-colors">Payments</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ct-paper font-medium">Leave a review</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-ct-mute hover:text-ct-mute-2 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-lg font-bold text-ct-paper mb-1">Rate your experience</h1>
            <p className="text-sm text-ct-mute">Help other clients by sharing your experience.</p>
          </div>

          <div className="h-px bg-ct-surface-2 mx-6" />

          {/* Tradie Info Card */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 p-3 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
              {job.tradie?.avatar_url ? (
                <img src={job.tradie.avatar_url} alt={tradieName} className="w-11 h-11 rounded-full object-cover" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                  <span className="text-ct-mute-2 font-bold text-lg">{tradieInitial}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ct-paper truncate">{tradieName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {category && (
                    <span className="px-2 py-0.5 bg-ct-surface-2 text-ct-mute-2 rounded-ct-xs text-xs font-medium border border-ct-line">
                      {category}
                    </span>
                  )}
                  {job.location_address && (
                    <span className="flex items-center gap-1 text-xs text-ct-mute">
                      <MapPin className="w-3 h-3" />
                      {job.location_address.split(',')[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Job description */}
            <p className="text-sm text-ct-mute-2 mt-3 line-clamp-2">{desc}</p>
          </div>

          <div className="h-px bg-ct-surface-2 mx-6" />

          {/* Review Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Star Rating */}
            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">Rating</label>
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
                          ? 'fill-ct-amber text-ct-amber'
                          : 'text-ct-mute'
                      }`}
                    />
                  </button>
                ))}
                {displayRating > 0 && (
                  <span className="ml-2 text-sm font-medium text-ct-mute-2">{RATING_LABELS[displayRating]}</span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">What stood out? <span className="text-ct-mute font-normal">(optional)</span></label>
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
                          ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30'
                          : 'bg-ct-surface text-ct-mute border-ct-line hover:border-ct-teal/30 hover:text-ct-mute-2'
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
              <label htmlFor="review-comment" className="block text-sm font-medium text-ct-mute-2 mb-2">
                Review <span className="text-ct-mute font-normal">(optional)</span>
              </label>
              <textarea
                {...proseInputProps}
                id="review-comment"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal resize-none placeholder-ct-placeholder"
                placeholder="Tell others about your experience with this tradie..."
              />
              <p className="text-xs text-ct-mute mt-1 text-right">{comment.length}/1000</p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm text-ct-rose text-sm">
                {error}
              </div>
            )}

            {/* Payment release info */}
            {!alreadyReleased && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm">
                <CheckCircle2 className="w-4 h-4 text-ct-teal flex-shrink-0" />
                <p className="text-xs text-ct-teal">
                  Submitting your review will also release the payment to your tradie.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 transition-colors"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={isSubmitting || rating === 0}
                className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? 'Submitting...' : alreadyReleased ? 'Submit review' : 'Submit review & release payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
