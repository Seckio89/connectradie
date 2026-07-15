// ─────────────────────────────────────────────────────────────────────────────
// QuoteFeeDisclosure — shown to TRADIES at quote submission: what the platform
// fee on this job will be and what they'll receive. Never rendered to clients
// (clients are never charged a platform fee and never see one).
//
// IMPORTANT — cutover seam: this must always mirror what the tradie is ACTUALLY
// charged. Today that's the legacy live fee model (src/lib/subscription.ts,
// matching supabase/functions/_shared/pricing.ts legacy calculators). When the
// Phase-3 fee cutover lands (V2: 10%/7%/3% marginal, GST-inclusive), swap the
// `liveFee` implementation below to calculatePlatformFeeCentsV2 — one place.
// ─────────────────────────────────────────────────────────────────────────────

import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { calculatePlatformFee, getCurrentTier } from '../lib/subscription';

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

  // Live fee model (legacy) — see cutover seam note above.
  const tier = getCurrentTier(tradieDetails?.subscription_tier ?? undefined, profile?.is_premium ?? false);
  const fee = calculatePlatformFee(priceDollars, tier);
  const receives = priceDollars - fee;
  const tierLabel = tier === 'free' ? 'Free' : tier === 'pro_plus' ? 'Pro+' : 'Pro';

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
