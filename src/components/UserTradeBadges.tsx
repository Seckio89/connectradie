import { CheckCircle2, Clock } from 'lucide-react';

interface UserTradeBadgesProps {
  verifiedTrades?: string[] | null;
  declaredTrades?: string[] | null;
  size?: 'sm' | 'md';
}

export default function UserTradeBadges({ verifiedTrades, declaredTrades, size = 'md' }: UserTradeBadgesProps) {
  const verified = verifiedTrades || [];
  const declared = declaredTrades || [];

  const pendingTrades = declared.filter(trade => !verified.includes(trade));

  if (verified.length === 0 && pendingTrades.length === 0) return null;

  const paddingClass = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div className="flex flex-wrap gap-1.5">
      {verified.map((trade) => (
        <span
          key={`v-${trade}`}
          className={`inline-flex items-center gap-1 ${paddingClass} bg-blue-600 text-white ${textClass} font-semibold rounded-full shadow-sm`}
        >
          <CheckCircle2 className={iconClass} />
          {trade}
        </span>
      ))}
      {pendingTrades.map((trade) => (
        <div key={`p-${trade}`} className="relative group">
          <span
            className={`inline-flex items-center gap-1 ${paddingClass} bg-white text-gray-500 ${textClass} font-medium rounded-full border border-gray-300`}
          >
            <Clock className={iconClass} />
            {trade}
          </span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 shadow-xl">
            Awaiting Certificate Verification
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ))}
    </div>
  );
}
