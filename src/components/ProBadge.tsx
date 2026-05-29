import { Crown } from 'lucide-react';

interface ProBadgeProps {
  /** Visual size. Defaults to "sm" which matches the inline-with-text TradieCard pattern. */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /** Optional override for the label. Defaults to "PRO". */
  label?: string;
}

/**
 * Compact Pro tier badge. Reused across TradieCard, QuoteComparisonView,
 * profile views, and any quote/tradie listing. Use isPro() from
 * src/lib/subscription.ts to decide whether to render.
 */
export default function ProBadge({ size = 'sm', className = '', label = 'PRO' }: ProBadgeProps) {
  const sizes = {
    xs: { wrap: 'px-1 py-0.5 text-[10px] gap-0.5', icon: 'w-2 h-2' },
    sm: { wrap: 'px-1.5 py-0.5 text-xs gap-0.5', icon: 'w-2.5 h-2.5' },
    md: { wrap: 'px-2 py-1 text-sm gap-1', icon: 'w-3 h-3' },
  }[size];

  return (
    <span
      className={`inline-flex items-center ${sizes.wrap} bg-warm-50 text-warm-700 font-semibold rounded-full border border-warm-200 leading-none ${className}`}
      title="Verified Pro — actively maintained subscription with priority placement, advanced analytics, and lower platform fees."
    >
      <Crown className={sizes.icon} />
      {label}
    </span>
  );
}
