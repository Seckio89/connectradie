// ─────────────────────────────────────────────────────────────────────────────
// PublicTradieRow — minimal tradie listing card for SEO landing pages.
//
// Optimised for crawl: every field is in static HTML, no JS-only state.
// Photo lazy-loads, name links to the public profile (also indexable).
// Renders the verification status pill so trust signal is visible above
// the click.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { Star, Shield, BadgeCheck, MapPin, MessageSquare } from 'lucide-react';

export interface PublicTradieSummary {
  id: string;
  full_name: string;
  trade_category: string | null;
  postcode: string | null;
  suburb: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  profile_image_url: string | null;
  bio: string | null;
  is_pro: boolean;
  license_verified: boolean;
  abn_verified: boolean;
  stripe_identity_verified: boolean;
}

interface PublicTradieRowProps {
  tradie: PublicTradieSummary;
}

export default function PublicTradieRow({ tradie }: PublicTradieRowProps) {
  const rating = tradie.average_rating ?? 0;
  const reviews = tradie.total_reviews ?? 0;

  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex gap-4 sm:gap-5">
        {/* Photo */}
        <Link to={`/tradie/${tradie.id}`} className="flex-shrink-0">
          {tradie.profile_image_url ? (
            <img
              src={tradie.profile_image_url}
              alt={`${tradie.full_name} profile photo`}
              loading="lazy"
              width={72}
              height={72}
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl object-cover bg-gray-100"
            />
          ) : (
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 font-semibold text-lg">
              {tradie.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </Link>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900">
              <Link to={`/tradie/${tradie.id}`} className="hover:text-emerald-600 transition-colors">
                {tradie.full_name}
              </Link>
            </h3>
            {tradie.is_pro && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-warm-50 border border-warm-200 text-warm-700 text-xs font-medium rounded-full">
                <BadgeCheck className="w-3 h-3" />
                Pro
              </span>
            )}
            {tradie.license_verified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary-50 border border-secondary-200 text-secondary-700 text-xs font-medium rounded-full">
                <Shield className="w-3 h-3" />
                Licence verified
              </span>
            )}
            {tradie.abn_verified && !tradie.license_verified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-full">
                <BadgeCheck className="w-3 h-3" />
                ABN verified
              </span>
            )}
          </div>

          {/* Rating */}
          {reviews > 0 ? (
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-1.5">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="font-medium text-gray-900">{rating.toFixed(1)}</span>
              <span className="text-gray-500">
                ({reviews} review{reviews === 1 ? '' : 's'})
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-1.5">No reviews yet — newly verified.</p>
          )}

          {/* Location */}
          {(tradie.suburb || tradie.postcode) && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <MapPin className="w-3 h-3" />
              <span>
                {tradie.suburb}
                {tradie.suburb && tradie.postcode ? ' · ' : ''}
                {tradie.postcode}
              </span>
            </div>
          )}

          {/* Bio */}
          {tradie.bio && (
            <p className="text-sm text-gray-600 leading-snug line-clamp-2 mb-3">
              {tradie.bio}
            </p>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/tradie/${tradie.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              View profile
            </Link>
            <Link
              to={`/tradie/${tradie.id}#message`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              Message
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
