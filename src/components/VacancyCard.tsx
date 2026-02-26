import { MapPin, Clock, BadgeCheck, GraduationCap, Award, Briefcase, Users, Building2 } from 'lucide-react';
import type { TradeVacancyWithEmployer } from '../types/database';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof GraduationCap }> = {
  apprentice: { label: 'Apprenticeship', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: GraduationCap },
  qualified: { label: 'Qualified Trade', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Briefcase },
  senior_advisory: { label: 'Senior / Advisory', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Award },
};

interface VacancyCardProps {
  vacancy: TradeVacancyWithEmployer;
  onApply: (vacancy: TradeVacancyWithEmployer) => void;
  hasApplied: boolean;
  isOwner: boolean;
  onManage?: (vacancy: TradeVacancyWithEmployer) => void;
}

export default function VacancyCard({ vacancy, onApply, hasApplied, isOwner, onManage }: VacancyCardProps) {
  const role = ROLE_CONFIG[vacancy.role_type] || ROLE_CONFIG.qualified;
  const RoleIcon = role.icon;
  const isVerified = vacancy.employer?.verification_status === 'verified';
  const businessName = vacancy.employer_details?.business_name || vacancy.employer?.full_name || 'Unknown Business';
  const daysAgo = Math.floor((Date.now() - new Date(vacancy.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${role.color}`}>
            <RoleIcon className="w-3.5 h-3.5" />
            {role.label}
          </div>
          {vacancy.status === 'closed' && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500">
              Closed
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-2 leading-snug group-hover:text-blue-700 transition-colors">
          {vacancy.title}
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-gray-700 truncate">{businessName}</span>
            {isVerified && (
              <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-3">
          {vacancy.description}
        </p>

        <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
          {vacancy.trade_category && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              {vacancy.trade_category}
            </span>
          )}
          {vacancy.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {vacancy.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {timeLabel}
          </span>
          {isOwner && vacancy.application_count !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {vacancy.application_count} application{vacancy.application_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 sm:px-6 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-end gap-2">
        {isOwner ? (
          <button
            onClick={() => onManage?.(vacancy)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-white transition-colors"
          >
            Manage Listing
          </button>
        ) : hasApplied ? (
          <span className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl">
            <BadgeCheck className="w-4 h-4" />
            Applied
          </span>
        ) : vacancy.status === 'open' ? (
          <button
            onClick={() => onApply(vacancy)}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            Apply Now
          </button>
        ) : null}
      </div>
    </div>
  );
}
