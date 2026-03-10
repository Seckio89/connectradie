import { useState, useEffect } from 'react';
import { X, Star, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const REVIEW_TAGS = [
  { key: 'punctual', label: 'Punctual' },
  { key: 'quality_work', label: 'Quality Work' },
  { key: 'good_communication', label: 'Good Communication' },
  { key: 'fair_pricing', label: 'Fair Pricing' },
  { key: 'clean_worksite', label: 'Clean Worksite' },
  { key: 'professional', label: 'Professional' },
  { key: 'reliable', label: 'Reliable' },
  { key: 'would_recommend', label: 'Would Recommend' },
] as const;

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  tradieId: string;
  tradieName: string;
  onReviewSubmitted?: () => void;
}

export default function ReviewModal({
  isOpen,
  onClose,
  jobId,
  tradieId,
  tradieName,
  onReviewSubmitted
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const displayRating = hoveredRating || rating;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('You must be logged in to submit a review');
        return;
      }

      const reviewComment = [
        comment.trim(),
        selectedTags.length > 0 ? `[Tags: ${selectedTags.join(', ')}]` : '',
      ].filter(Boolean).join('\n');

      const { error: insertError } = await supabase
        .from('reviews')
        .insert({
          job_id: jobId,
          tradie_id: tradieId,
          client_id: user.id,
          rating,
          comment: reviewComment || null
        });

      if (insertError) throw insertError;

      setRating(0);
      setComment('');
      setSelectedTags([]);
      onReviewSubmitted?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setHoveredRating(0);
      setComment('');
      setSelectedTags([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 modal-sheet-overlay">
      <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto modal-sheet">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900">Rate Your Experience</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="h-px bg-gray-100 mx-6" />

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Tradie name */}
          <p className="text-sm text-gray-600">
            How was your experience with <span className="font-semibold text-gray-900">{tradieName}</span>?
          </p>

          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What stood out? <span className="text-gray-400 font-normal">(optional)</span>
            </label>
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
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-transparent resize-none placeholder-gray-400"
              placeholder="Tell others about your experience..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || rating === 0}
              className="flex-1 px-4 py-2.5 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
