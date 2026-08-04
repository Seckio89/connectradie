import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Shield, FileCheck, Calendar, MessageCircle, Star, ShieldCheck, MapPin, ExternalLink, FileText } from 'lucide-react';
import ProBadge from './ProBadge';
import type { TradieWithDetails } from '../types/database';
import { getTradieRating, type TradieRating } from '../lib/reviews';
import { redactName } from '../lib/contactGating';
import UserTradeBadges from './UserTradeBadges';

interface TradieCardProps {
  tradie: TradieWithDetails;
  onChat: (tradie: TradieWithDetails) => void;
  onViewCalendar: (tradie: TradieWithDetails) => void;
  onSave?: (tradie: TradieWithDetails) => void;
  isSaved?: boolean;
  onRequestQuote?: (tradie: TradieWithDetails) => void;
  /** Unread messages from this tradie. Omit or 0 to hide the badge. */
  unreadCount?: number;
}

export default function TradieCard({ tradie, onChat, onViewCalendar, onSave, isSaved, onRequestQuote, unreadCount }: TradieCardProps) {
  const details = tradie.tradie_details;
  const availabilityHours = tradie.availability_hours;
  const hasSetAvailability = availabilityHours != null;
  const [rating, setRating] = useState<TradieRating | null>(null);
  const isPro = details?.subscription_tier === 'pro' || details?.subscription_tier === 'business' || tradie.is_premium;
  // "Verified Pro" upgrade: Pro tier + Stripe Identity confirmed. Surfaced as
  // the highest-trust badge — gives clients a clear signal beyond ABN/licence.
  const isVerifiedPro = isPro && tradie.is_identity_verified === true;
  const displayName = isPro ? (details?.business_name || redactName(tradie.full_name)) : redactName(tradie.full_name);
  // `public_suburb` is a generated column — the same extractSuburb() logic, run
  // in Postgres. Selecting it means the raw street address never leaves the DB.
  const suburb = tradie.public_suburb ?? '';

  useEffect(() => {
    loadRating();
  }, [tradie.id]);

  const loadRating = async () => {
    const tradieRating = await getTradieRating(tradie.id);
    setRating(tradieRating);
  };

  const getAvailabilityStatus = () => {
    if (!hasSetAvailability) {
      return { text: 'Request availability', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', dot: 'bg-ct-teal', border: 'border-ct-teal/30' };
    }
    if (availabilityHours >= 10) {
      return { text: 'Available this week', color: 'text-ct-teal', bg: 'bg-ct-teal/[0.14]', dot: 'bg-ct-teal/[0.14]', border: 'border-ct-teal/30' };
    } else if (availabilityHours > 0) {
      return { text: 'Limited availability', color: 'text-ct-amber', bg: 'bg-ct-amber/[0.13]', dot: 'bg-ct-teal', border: 'border-ct-teal/30' };
    } else {
      return { text: 'Busy this week', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', dot: 'bg-ct-surface-2', border: 'border-ct-line' };
    }
  };

  const availability = getAvailabilityStatus();
  const isIdentityVerified = details?.is_verified || tradie.verification_status === 'verified';

  return (
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line-soft shadow-sm shadow-gray-200/60 hover:shadow-md hover:shadow-gray-200/80 transition-all duration-200 overflow-hidden group">
      <div className="p-5">
        {/* Header: avatar + info + save */}
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-ct-md bg-ct-surface-2 overflow-hidden flex-shrink-0 ring-1 ring-ct-line">
            {tradie.avatar_url ? (
              <img
                src={tradie.avatar_url}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-ct-surface-2 flex items-center justify-center">
                <span className="text-xl font-bold text-ct-mute-2">
                  {tradie.full_name?.charAt(0) || 'T'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/tradie/${tradie.id}`}
                className="font-semibold text-ct-paper text-sm line-clamp-2 break-words hover:text-ct-mute-2 transition-colors"
              >
                {displayName}
              </Link>
              {isPro && (
                <BadgeCheck className="w-4 h-4 text-ct-teal flex-shrink-0" />
              )}
              {isPro && <ProBadge size="sm" variant={isVerifiedPro ? 'verified' : 'pro'} />}
            </div>
            <p className="text-xs text-ct-mute capitalize mt-0.5">
              {details?.trade_category || 'Trade professional'}
            </p>
            <div className="mt-1.5">
              <UserTradeBadges
                verifiedTrades={tradie.verified_trades || []}
                declaredTrades={tradie.declared_trades || []}
                size="sm"
              />
            </div>
            {suburb && (
              <div className="flex items-center gap-1 mt-1 text-xs text-ct-mute">
                <MapPin className="w-3 h-3" />
                <span>{suburb}</span>
              </div>
            )}
          </div>

          {onSave && (
            <button
              onClick={() => onSave(tradie)}
              className={`p-2 rounded-ct-md transition-all min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center ${
                isSaved
                  ? 'bg-ct-surface-2 text-ct-mute-2 ring-1 ring-ct-teal'
                  : 'bg-ct-surface-2 text-ct-mute hover:bg-ct-surface-2 hover:text-ct-mute-2'
              }`}
            >
              <svg className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          )}
        </div>

        {/* Rating */}
        {rating && rating.total_reviews > 0 && (
          <div className="flex items-center gap-1 mt-3">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < Math.round(rating.average_rating)
                    ? 'fill-yellow-400 text-ct-amber'
                    : 'text-ct-paper'
                }`}
              />
            ))}
            <span className="text-xs text-ct-mute ml-1">
              {rating.average_rating.toFixed(1)} ({rating.total_reviews})
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {isIdentityVerified && (
            <div className="relative group/tip">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-ct-xs border border-ct-line cursor-help">
                <ShieldCheck className="w-3 h-3" />
                ID Verified
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-ct-surface text-ct-paper text-xs rounded-ct-sm whitespace-nowrap opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{redactName(tradie.full_name)} - Identity & Credentials Verified</span>
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
          {details?.is_insured && (
            <div className="relative group/tip">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ct-surface-2 text-ct-mute-2 text-xs font-medium rounded-ct-xs border border-ct-line cursor-help">
                <Shield className="w-3 h-3" />
                Insured
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-ct-surface text-ct-paper text-xs rounded-ct-sm whitespace-nowrap opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                <div className="flex items-center gap-1.5 font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Insurance verified</span>
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
          {details?.is_licensed && (
            <div className="relative group/tip">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ct-amber/[0.13] text-ct-amber text-xs font-medium rounded-ct-xs border border-ct-teal/30 cursor-help">
                <FileCheck className="w-3 h-3" />
                Licensed
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-ct-surface text-ct-paper text-xs rounded-ct-sm opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl max-w-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Qualifications</span>
                  </div>
                  {details.qualifications && details.qualifications.length > 0 ? (
                    <ul className="space-y-0.5 text-ct-mute">
                      {details.qualifications.map((qual, index) => (
                        <li key={index} className="whitespace-nowrap">• {qual}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-ct-mute">Licensed professional</div>
                  )}
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
        </div>

        {/* Availability + Pricing row */}
        <div className="flex items-center flex-wrap gap-2 mt-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ct-sm text-xs font-medium ${availability.bg} ${availability.color} border ${availability.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${availability.dot} animate-pulse`} />
            {availability.text}
          </span>

          {details?.hourly_rate && (
            <span className="text-xs text-ct-mute">
              From <span className="font-semibold text-ct-mute-2">${details.hourly_rate}/hr</span>
            </span>
          )}
        </div>


        {tradie.has_phone && (
          <p className="mt-2 text-xs text-ct-mute">
            Contact via chat
          </p>
        )}
      </div>

      {/* Actions footer */}
      <div className="px-5 py-3 border-t border-ct-line-soft">
        <div className="flex items-center gap-2 flex-wrap">
          {onRequestQuote && (
            <button
              onClick={() => onRequestQuote(tradie)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-ct-sm bg-ct-teal text-ct-ink hover:brightness-110 transition-colors min-h-[44px]"
            >
              <FileText className="w-3.5 h-3.5" />
              Request Quote
            </button>
          )}
          <button
            onClick={() => onChat(tradie)}
            className="relative inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-ct-sm border border-ct-line text-ct-mute-2 hover:bg-ct-surface-2 transition-colors min-h-[44px]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat
            {!!unreadCount && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-ct-teal text-ct-ink text-[0.625rem] font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-white"
                aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onViewCalendar(tradie)}
              className="p-2.5 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Check calendar"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <Link
              to={`/tradie/${tradie.id}`}
              className="p-2.5 text-ct-teal hover:text-ct-teal hover:bg-ct-teal/[0.14] rounded-ct-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="View full profile"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
