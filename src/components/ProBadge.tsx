import { Crown, BadgeCheck } from 'lucide-react';

interface ProBadgeProps {
  /** Visual size. Defaults to "sm" which matches the inline-with-text TradieCard pattern. */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /**
   * "verified" upgrades the badge to "Verified Pro" — visually richer and
   * gated on Stripe Identity verification in addition to Pro tier. Pass the
   * tradie's is_identity_verified flag; component decides whether to render
   * the verified or plain variant based on this prop.
   */
  variant?: 'pro' | 'verified';
  /** Optional override for the label. */
  label?: string;
}

/**
 * Compact Pro tier badge. Reused across TradieCard, QuoteComparisonView,
 * profile views, and any quote/tradie listing. Use isPro() from
 * src/lib/subscription.ts to decide whether to render at all; pass
 * variant="verified" when the tradie also has is_identity_verified=true to
 * surface the higher-trust signal.
 */
export default function ProBadge({
  size = 'sm',
  className = '',
  variant = 'pro',
  label,
}: ProBadgeProps) {
  const sizes = {
    xs: { wrap: 'px-1 py-0.5 text-[10px] gap-0.5', icon: 'w-2 h-2' },
    sm: { wrap: 'px-1.5 py-0.5 text-xs gap-0.5', icon: 'w-2.5 h-2.5' },
    md: { wrap: 'px-2 py-1 text-sm gap-1', icon: 'w-3 h-3' },
  }[size];

  const isVerified = variant === 'verified';
  const displayLabel = label ?? (isVerified ? 'VERIFIED PRO' : 'PRO');
  const tone = isVerified
    ? 'bg-gradient-to-r from-emerald-50 to-warm-50 text-emerald-700 border-emerald-200'
    : 'bg-warm-50 text-warm-700 border-warm-200';
  const Icon = isVerified ? BadgeCheck : Crown;
  const title = isVerified
    ? 'Verified Pro — government ID confirmed via Stripe Identity, Pro subscription active. Highest trust signal on the platform.'
    : 'Pro — actively maintained subscription with priority placement, advanced analytics, and lower platform fees.';

  return (
    <span
      className={`inline-flex items-center ${sizes.wrap} font-semibold rounded-full border leading-none ${tone} ${className}`}
      title={title}
    >
      <Icon className={sizes.icon} />
      {displayLabel}
    </span>
  );
}
