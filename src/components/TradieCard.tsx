import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Shield, FileCheck, Calendar, MessageCircle, Star, Crown, Truck, ShieldCheck, MapPin, ExternalLink } from 'lucide-react';
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
}

export default function TradieCard({ tradie, onChat, onViewCalendar, onSave, isSaved }: TradieCardProps) {
  const details = tradie.tradie_details;
  const availabilityHours = tradie.availability_hours ?? 0;
  const [rating, setRating] = useState<TradieRating | null>(null);
  const displayName = details?.business_name || redactName(tradie.full_name);
  const suburb = extractSuburb(tradie.address);

  useEffect(() => {
    loadRating();
  }, [tradie.id]);

  const loadRating = async () => {
    const tradieRating = await getTradieRating(tradie.id);
    setRating(tradieRating);
  };

  const getAvailabilityStatus = () => {
    if (availabilityHours >= 10) {
      return { text: 'Available This Week', color: 'text-green-600', bg: 'bg-green-100', dot: 'bg-green-500' };
    } else if (availabilityHours > 0) {
      return { text: 'Limited Availability', color: 'text-amber-600', bg: 'bg-amber-100', dot: 'bg-amber-500' };
    } else {
      return { text: 'Fully Booked', color: 'text-red-600', bg: 'bg-red-100', dot: 'bg-red-500' };
    }
  };

  const availability = getAvailabilityStatus();
  const isPro = details?.subscription_tier === 'pro';
  const isIdentityVerified = details?.is_verified || tradie.verification_status === 'verified';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden">
            {tradie.avatar_url ? (
              <img
                src={tradie.avatar_url}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-600">
                  {tradie.full_name?.charAt(0) || 'T'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/tradie/${tradie.id}`}
                className="font-semibold text-gray-900 truncate hover:text-primary-600 transition-colors"
              >
                {displayName}
              </Link>
              {isPro && (
                <BadgeCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
              )}
              {isPro && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                  <Crown className="w-3 h-3" />
                  PRO
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 capitalize mt-0.5">
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
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3" />
                <span>{suburb}</span>
              </div>
            )}

            {rating && rating.total_reviews > 0 && (
              <div className="flex items-center gap-1 mt-2">
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
                <span className="text-sm text-gray-600 ml-1">
                  {rating.average_rating.toFixed(1)} ({rating.total_reviews})
                </span>
              </div>
            )}
          </div>

          {onSave && (
            <button
              onClick={() => onSave(tradie)}
              className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                isSaved
                  ? 'bg-primary-100 text-primary-600'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }`}
            >
              <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {isIdentityVerified && (
            <div className="relative group">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200 cursor-help">
                <ShieldCheck className="w-3.5 h-3.5" />
                ID Verified
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{redactName(tradie.full_name)} - Identity & Credentials Verified</span>
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
          {details?.is_insured && (
            <div className="relative group">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200 cursor-help">
                <Shield className="w-3.5 h-3.5" />
                Insured
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Insurance Verified</span>
                  </div>
                </div>
                <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
          {details?.is_licensed && (
            <div className="relative group">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200 cursor-help">
                <FileCheck className="w-3.5 h-3.5" />
                Licensed
              </span>
              <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl max-w-xs">
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

        <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${availability.bg}`}>
          <span className={`w-2 h-2 rounded-full ${availability.dot} animate-pulse`} />
          <span className={`text-sm font-medium ${availability.color}`}>
            {availability.text}
          </span>
        </div>

        {(details?.hourly_rate || (tradie.call_out_fee && tradie.show_callout_fee)) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {details?.hourly_rate && (
              <p className="text-sm text-gray-600">
                From <span className="font-semibold text-gray-900">${details.hourly_rate}/hr</span>
              </p>
            )}
            {tradie.call_out_fee && tradie.show_callout_fee && (
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">${tradie.call_out_fee}</span> visit fee
                </span>
                {tradie.callout_fee_waived_on_proceed && (
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-md">
                    Waived if you proceed
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {tradie.phone && (
          <p className="mt-2 text-sm text-gray-500 italic">
            Contact via chat
          </p>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl space-y-2">
        <div className="flex gap-3">
          <button
            onClick={() => onViewCalendar(tradie)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            <Calendar className="w-4 h-4" />
            Check Calendar
          </button>
          <button
            onClick={() => onChat(tradie)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors min-h-[44px]"
          >
            <MessageCircle className="w-4 h-4" />
            Chat
          </button>
        </div>
        <Link
          to={`/tradie/${tradie.id}`}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-primary-600 font-medium transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Full Profile
        </Link>
      </div>
    </div>
  );
}
