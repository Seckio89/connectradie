import { Star } from 'lucide-react';
import type { TradieRating } from '../lib/reviews';

interface RatingBreakdownProps {
  rating: TradieRating;
}

export default function RatingBreakdown({ rating }: RatingBreakdownProps) {
  const bars = [
    { label: '5', count: rating.five_star_count },
    { label: '4', count: rating.four_star_count },
    { label: '3', count: rating.three_star_count },
    { label: '2', count: rating.two_star_count },
    { label: '1', count: rating.one_star_count },
  ];

  const maxCount = Math.max(...bars.map(b => b.count), 1);

  return (
    <div className="flex items-start gap-6">
      <div className="text-center flex-shrink-0">
        <div className="text-5xl font-bold text-gray-900">
          {rating.average_rating.toFixed(1)}
        </div>
        <div className="flex items-center justify-center gap-0.5 mt-2">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${
                i < Math.round(rating.average_rating)
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {rating.total_reviews} {rating.total_reviews === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      <div className="flex-1 space-y-1.5 min-w-0">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-3 text-right flex-shrink-0">{bar.label}</span>
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${(bar.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{bar.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
