import { useEffect, useState } from 'react';
import { Star, User, ThumbsUp } from 'lucide-react';
import { getTradieReviews, type Review } from '../lib/reviews';

interface ReviewsListProps {
  tradieId: string;
}

const TAG_LABELS: Record<string, string> = {
  punctual: 'Punctual',
  quality_work: 'Quality Work',
  good_communication: 'Good Communication',
  fair_pricing: 'Fair Pricing',
  clean_worksite: 'Clean Worksite',
  professional: 'Professional',
  experienced: 'Experienced',
  reliable: 'Reliable',
  friendly: 'Friendly',
  would_recommend: 'Would Recommend',
};

function parseComment(comment: string | null): { text: string; tags: string[] } {
  if (!comment) return { text: '', tags: [] };

  const tagMatch = comment.match(/\[Tags?:\s*([^\]]+)\]/i);
  const tags = tagMatch
    ? tagMatch[1].split(',').map(t => t.trim()).filter(Boolean)
    : [];

  const text = comment
    .replace(/\[Tags?:\s*[^\]]+\]/gi, '')
    .trim();

  return { text, tags };
}

export default function ReviewsList({ tradieId }: ReviewsListProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReviews();
  }, [tradieId]);

  const loadReviews = async () => {
    setIsLoading(true);
    const data = await getTradieReviews(tradieId);
    setReviews(data);
    setIsLoading(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No reviews yet for this tradie.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => {
        const { text, tags } = parseComment(review.comment);
        return (
          <div
            key={review.id}
            className="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-colors"
          >
            {/* Header: avatar, name, date, stars */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-900">
                    {review.client?.full_name || 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {formatDate(review.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i < review.rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Comment text */}
            {text && (
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                {text}
              </p>
            )}

            {/* Tags as pills */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    {TAG_LABELS[tag] || tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {/* No comment and no tags — show a minimal note */}
            {!text && tags.length === 0 && (
              <p className="text-sm text-gray-400 italic">No written review</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
