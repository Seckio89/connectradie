// ─────────────────────────────────────────────────────────────────────────────
// QuoteFeeDisclosure — shown to TRADIES at quote submission: what the platform
// fee on this job will be and what they'll receive. Never rendered to clients
// (clients are never charged a platform fee and never see one).
//
// This mirrors what the tradie is ACTUALLY charged. calculatePlatformFee
// (src/lib/subscription.ts) now delegates to the V2 engine — the same schedule
// the edge functions charge (supabase/functions/_shared/pricing.ts): Free 10% /
// cap $900, Pro 7% / cap $630, 3.5%/5% on the part above $3,000, GST-inclusive.
// ─────────────────────────────────────────────────────────────────────────────

import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { calculatePlatformFee, getChargedTier } from '../lib/subscription';

interface QuoteFeeDisclosureProps {
  /** The quoted price in dollars (use the max of a range). */
  priceDollars: number;
  className?: string;
}

const money = (n: number) =>
  `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function QuoteFeeDisclosure({ priceDollars, className }: QuoteFeeDisclosureProps) {
  const { profile, tradieDetails } = useAuth();
  if (!priceDollars || priceDollars <= 0 || profile?.role !== 'tradie') return null;

  // Uses getChargedTier (subscription_tier only, no is_premium fallback) so the
  // number shown here can never disagree with what the edge functions charge.
  const tier = getChargedTier(tradieDetails?.subscription_tier);
  const fee = calculatePlatformFee(priceDollars, tier);
  const receives = priceDollars - fee;
  const tierLabel = tier === 'free' ? 'Free' : 'Pro'; // pro & the retired pro_plus both show as Pro

  return (
    <div className={`flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 ${className ?? ''}`}>
      <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-gray-600 leading-relaxed">
        Platform fee on completion: <span className="font-semibold text-gray-800">{money(fee)}</span>
        {' '}({tierLabel} plan) — you receive{' '}
        <span className="font-semibold text-gray-800">{money(receives)}</span>.
        {' '}<span className="text-gray-400">Quoting is always free; the fee only applies when the job completes.</span>
      </p>
    </div>
  );
}
