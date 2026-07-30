import { MapPin, Clock, BadgeCheck, GraduationCap, Award, Briefcase, Users, Building2, DollarSign, CalendarDays, Laptop } from 'lucide-react';
import type { TradeVacancyWithEmployer } from '../types/database';
import { formatPay, employmentLabel, vacancyTradeLabel } from '../lib/vacancyOptions';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof GraduationCap }> = {
  apprentice: { label: 'Apprenticeship', color: 'bg-ct-surface-2 text-ct-mute-2 border-ct-line', icon: GraduationCap },
  qualified: { label: 'Qualified Trade', color: 'bg-ct-surface-2 text-ct-mute-2 border-ct-line', icon: Briefcase },
  senior_advisory: { label: 'Senior / Advisory', color: 'bg-ct-amber/[0.13] text-ct-amber border-ct-amber/[0.34]', icon: Award },
  non_trade: { label: 'Office / Support', color: 'bg-ct-surface-2 text-ct-mute-2 border-ct-line', icon: Laptop },
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

  const pay = formatPay(vacancy);
  const employment = employmentLabel(vacancy.employment_type);
  const tradeLabel = vacancyTradeLabel(vacancy.trade_category);
  const tickets = vacancy.required_tickets || [];
  const closes = vacancy.closing_date
    ? new Date(vacancy.closing_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="bg-ct-surface border border-ct-line-soft rounded-ct-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ct-sm text-xs font-semibold border ${role.color}`}>
              <RoleIcon className="w-3.5 h-3.5" />
              {role.label}
            </div>
            {employment && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-ct-sm text-xs font-medium bg-ct-surface-2 text-ct-mute-2 border border-ct-line">
                {employment}
              </span>
            )}
          </div>
          {vacancy.status === 'closed' && (
            <span className="px-2.5 py-1 rounded-ct-sm text-xs font-semibold bg-ct-surface-2 text-ct-mute">
              Closed
            </span>
          )}
          {vacancy.status === 'draft' && (
            <span className="px-2.5 py-1 rounded-ct-sm text-xs font-semibold bg-ct-amber/[0.13] text-ct-amber">
              Draft
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-ct-paper mb-2 leading-snug group-hover:text-ct-mute-2 transition-colors">
          {vacancy.title}
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ct-surface-2 to-ct-line flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-ct-mute" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-ct-mute-2 truncate">{businessName}</span>
            {isVerified && <BadgeCheck className="w-4 h-4 text-ct-teal flex-shrink-0" />}
          </div>
        </div>

        {pay && (
          <div className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-ct-teal">
            <DollarSign className="w-4 h-4" />
            {pay}
          </div>
        )}

        <p className="text-sm text-ct-mute-2 leading-relaxed mb-4 line-clamp-3">
          {vacancy.description}
        </p>

        {tickets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tickets.slice(0, 4).map(t => (
              <span key={t} className="px-2 py-0.5 rounded-ct-xs text-[11px] font-medium bg-ct-surface-2 text-ct-mute-2 border border-ct-line">
                {t}
              </span>
            ))}
            {tickets.length > 4 && (
              <span className="px-2 py-0.5 rounded-ct-xs text-[11px] font-medium text-ct-mute">
                +{tickets.length - 4} more
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap text-xs text-ct-mute">
          {tradeLabel && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              {tradeLabel}
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
          {closes && vacancy.status === 'open' && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Closes {closes}
            </span>
          )}
          {isOwner && vacancy.application_count !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {vacancy.application_count} application{vacancy.application_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 sm:px-6 py-3.5 bg-ct-surface-2/70 border-t border-ct-line-soft flex items-center justify-end gap-2">
        {isOwner ? (
          <button
            onClick={() => onManage?.(vacancy)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-ct-mute-2 border border-ct-line rounded-ct-md hover:bg-ct-surface transition-colors"
          >
            Manage Listing
          </button>
        ) : hasApplied ? (
          <span className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-ct-teal bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md">
            <BadgeCheck className="w-4 h-4" />
            Applied
          </span>
        ) : vacancy.status === 'open' ? (
          <button
            onClick={() => onApply(vacancy)}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-ct-ink bg-ct-teal rounded-ct-md hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Apply Now
          </button>
        ) : null}
      </div>
    </div>
  );
}
