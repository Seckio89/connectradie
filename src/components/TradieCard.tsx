import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Shield, FileCheck, Calendar, MessageCircle, Star, Truck, ShieldCheck, MapPin, ExternalLink, FileText } from 'lucide-react';
import ProBadge from './ProBadge';
import type { TradieWithDetails } from '../types/database';
import { getTradieRating, type TradieRating } from '../lib/reviews';
import { redactName, extractSuburb } from '../lib/contactGating';
import UserTradeBadges from './UserTradeBadges';

interface TradieCardProps {
  tradie: TradieWithDetails;
  onChat: (tradie: TradieWithDetails) => void;
  onViewCalendar: (tradie: TradieWithDetails) => void;
  onSave?: (tradie: TradieWithDetails) => void;
  isSaved?: boolean;
  onRequestQuote?: (tradie: TradieWithDetails) => void;
}

export default function TradieCard({ tradie, onChat, onViewCalendar, onSave, isSaved, onRequestQuote }: TradieCardProps) {
  const details = tradie.tradie_details;
  const availabilityHours = tradie.availability_hours;
  const hasSetAvailability = availabilityHours != null;
  const [rating, setRating] = useState<TradieRating | null>(null);
  const isPro = details?.subscription_tier === 'pro' || details?.subscription_tier === 'business' || tradie.is_premium;
  // "Verified Pro" upgrade: Pro tier + Stripe Identity confirmed. Surfaced as
  // the highest-trust badge — gives clients a clear signal beyond ABN/licence.
  const isVerifiedPro = isPro && tradie.is_identity_verified === true;
  const displayName = isPro ? (details?.business_name || redactName(tradie.full_name)) : redactName(tradie.full_name);
  const suburb = extractSuburb(tradie.address);

  useEffect(() => {
    loadRating();
  }, [tradie.id]);

  const loadRating = async () => {
    const tradieRating = await getTradieRating(tradie.id);
    setRating(tradieRating);
  };

  const getAvailabilityStatus = () => {
    if (!hasSetAvailability) {
      return { text: 'Request Availability', color: 'text-primary-700', bg: 'bg-primary-50', dot: 'bg-primary-400', border: 'border-primary-100' };
    }
    if (availabilityHours >= 10) {
      return { text: 'Available This Week', color: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500', border: 'border-green-100' };
    } else if (availabilityHours > 0) {
      return { text: 'Limited Availability', color: 'text-warm-700', bg: 'bg-warm-50', dot: 'bg-warm-500', border: 'border-warm-100' };
    } else {
      return { text: 'Busy This Week', color: 'text-gray-600', bg: 'bg-gray-50', dot: 'bg-gray-400', border: 'border-gray-200' };
    }
  };

  const availability = getAvailabilityStatus();
  const isIdentityVerified = details?.is_verified || tradie.verification_status === 'verified';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-200/60 hover:shadow-md hover:shadow-gray-200/80 transition-all duration-200 overflow-hidden group">
      <div className="p-5">
        {/* Header: avatar + info + save */}
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 ring-1 ring-gray-100">
            {tradie.avatar_url ? (
              <img
                src={tradie.avatar_url}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary-50 flex items-center justify-center">
                <span className="text-xl font-bold text-primary-600">
                  {tradie.full_name?.charAt(0) || 'T'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/tradie/${tradie.id}`}
                className="font-semibold text-gray-900 text-sm line-clamp-2 break-words hover:text-primary-600 transition-colors"
              >
                {displayName}
              </Link>
              {isPro && (
                <BadgeCheck className="w-4 h-4 text-primary-500 flex-shrink-0" />
              )}
              {isPro && <ProBadge size="sm" variant={isVerifiedPro ? 'verified' : 'pro'} />}
            </div>
            <p className="text-xs text-gray-500 capitalize mt-0.5">
              {details?.trade_category || 'Trade Professional'}
            </p>
            <div className="mt-1.5">
              <UserTradeBadges
                verifiedTrades={tradie.verified_trades || []}
                declaredTrades={tradie.declared_trades || []}
                size="sm"
              />
            </div>
            {suburb && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                <MapPin className="w-3 h-3" />
                <span>{suburb}</span>
              </div>
            )}
          </div>

          {onSave && (
            <button
              onClick={() => onSave(tradie)}
              className={`p-2 rounded-xl transition-all min-w-[36px] min-h-[36px] flex items-center justify-center ${
                isSaved
                  ? 'bg-primary-50 text-primary-600 ring-1 ring-primary-200'
                  : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
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
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-200'
                }`}
              />
            ))}
            <span className="text-xs text-gray-500 ml-1">
              {rating.average_rating.toFixed(1)} ({rating.total_reviews})
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {isIdentityVerified && (
            <div className="relative group/tip">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary-50 text-secondary-700 text-xs font-medium rounded-md border border-secondary-100 cursor-help">
                <ShieldCheck className="w-3 h-3" />
                ID Verified
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary-50 text-secondary-700 text-xs font-medium rounded-md border border-secondary-100 cursor-help">
                <Shield className="w-3 h-3" />
                Insured
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                <div className="flex items-center gap-1.5 font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Insurance Verified</span>
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
          {details?.is_licensed && (
            <div className="relative group/tip">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warm-50 text-warm-700 text-xs font-medium rounded-md border border-warm-100 cursor-help">
                <FileCheck className="w-3 h-3" />
                Licensed
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all duration-200 pointer-events-none z-50 shadow-xl max-w-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Qualifications</span>
                  </div>
                  {details.qualifications && details.qualifications.length > 0 ? (
                    <ul className="space-y-0.5 text-gray-300">
                      {details.qualifications.map((qual, index) => (
                        <li key={index} className="whitespace-nowrap">• {qual}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-gray-300">Licensed Professional</div>
                  )}
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
        </div>

        {/* Availability + Pricing row */}
        <div className="flex items-center flex-wrap gap-2 mt-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${availability.bg} ${availability.color} border ${availability.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${availability.dot} animate-pulse`} />
            {availability.text}
          </span>

          {details?.hourly_rate && (
            <span className="text-xs text-gray-500">
              From <span className="font-semibold text-gray-700">${details.hourly_rate}/hr</span>
            </span>
          )}
        </div>


        {tradie.phone && (
          <p className="mt-2 text-xs text-gray-400">
            Contact via chat
          </p>
        )}
      </div>

      {/* Actions footer */}
      <div className="px-5 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          {onRequestQuote && (
            <button
              onClick={() => onRequestQuote(tradie)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors min-h-[44px]"
            >
              <FileText className="w-3.5 h-3.5" />
              Request Quote
            </button>
          )}
          <button
            onClick={() => onChat(tradie)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onViewCalendar(tradie)}
              className="p-2.5 text-secondary-400 hover:text-secondary-600 hover:bg-secondary-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Check Calendar"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <Link
              to={`/tradie/${tradie.id}`}
              className="p-2.5 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="View Full Profile"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
