import { useEffect, useState } from 'react';
import { Star, User, ThumbsUp, ChevronDown, Briefcase } from 'lucide-react';
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
  const text = comment.replace(/\[Tags?:\s*[^\]]+\]/gi, '').trim();
  return { text, tags };
}

function getJobLabel(review: Review): string {
  if (review.job?.title) return review.job.title;
  const match = review.job?.description?.match(/^\[([^\]]+)\]/);
  if (match) return match[1].replace(/_/g, ' ');
  return 'Job';
}

export default function ReviewsList({ tradieId }: ReviewsListProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const data = await getTradieReviews(tradieId);
      setReviews(data);
      setIsLoading(false);
    })();
  }, [tradieId]);

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

  // Group reviews by month
  const monthGroups = new Map<string, Review[]>();
  for (const review of reviews) {
    const d = new Date(review.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthGroups.has(key)) monthGroups.set(key, []);
    monthGroups.get(key)!.push(review);
  }
  const sortedMonths = [...monthGroups.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-3">
      {sortedMonths.map((monthKey, idx) => {
        const monthReviews = monthGroups.get(monthKey)!;
        const [yr, mo] = monthKey.split('-');
        const monthLabel = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
        const avgRating = monthReviews.reduce((sum, r) => sum + r.rating, 0) / monthReviews.length;

        return (
          <details key={monthKey} open={idx === 0} className="group/month">
            <summary className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors select-none list-none">
              <div className="flex items-center gap-2">
                <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open/month:rotate-0 -rotate-90" />
                <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-3 h-3 ${i < Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                  ))}
                </div>
                <span className="text-xs text-gray-400">{monthReviews.length} review{monthReviews.length !== 1 ? 's' : ''}</span>
              </div>
            </summary>

            <div className="space-y-3 mt-2 mb-4">
              {monthReviews.map((review) => {
                const { text, tags } = parseComment(review.comment);
                const jobLabel = getJobLabel(review);
                return (
                  <div key={review.id} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-colors">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary-600" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {review.client?.full_name || 'Anonymous'}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">
                              {new Date(review.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Briefcase className="w-3 h-3" />
                              <span className="capitalize">{jobLabel}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </div>

                    {text && (
                      <p className="text-sm text-gray-600 leading-relaxed mb-3 ml-12">{text}</p>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 ml-12">
                        {tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                            <ThumbsUp className="w-3 h-3" />
                            {TAG_LABELS[tag] || tag.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}

                    {!text && tags.length === 0 && (
                      <p className="text-sm text-gray-400 italic ml-12">No written review</p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
