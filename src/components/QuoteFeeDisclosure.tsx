// ─────────────────────────────────────────────────────────────────────────────
// QuoteFeeDisclosure — shown to TRADIES at quote submission: what the platform
// fee on this job will be and what they'll receive. Never rendered to clients
// (clients are never charged a platform fee and never see one).
//
// Pricing v2.1: commission applies to the tradie's LABOUR only. Materials pass
// through untouched, with card processing deducted at cost (~1.93%) and shown as
// its own line — never blended into the fee, so there is visibly no margin
// hidden in it.
//
// The wording here deliberately matches the "How fees work" explainer (spec
// §0A): what a tradie reads in the explainer must be literally what they see on
// their money.
//
// calculatePlatformFee / calculateMaterialsProcessing (src/lib/subscription.ts)
// delegate to the same v2.1 engine the edge functions charge with
// (supabase/functions/_shared/pricing.ts), so this can never disagree with the
// actual charge.
// ─────────────────────────────────────────────────────────────────────────────

import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  calculatePlatformFee,
  calculateMaterialsProcessing,
  getChargedTier,
} from '../lib/subscription';

interface QuoteFeeDisclosureProps {
  /** The tradie's labour in dollars — commission applies to this only. */
  labourDollars: number;
  /** Materials at cost in dollars — no commission, card processing at cost. */
  materialsDollars?: number;
  className?: string;
}

const money = (n: number) =>
  `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function QuoteFeeDisclosure({
  labourDollars,
  materialsDollars = 0,
  className,
}: QuoteFeeDisclosureProps) {
  const { profile, tradieDetails } = useAuth();

  const labour = Math.max(0, labourDollars || 0);
  const materials = Math.max(0, materialsDollars || 0);
  const total = labour + materials;

  if (total <= 0 || profile?.role !== 'tradie') return null;

  // Uses getChargedTier (subscription_tier only, no is_premium fallback) so the
  // number shown here can never disagree with what the edge functions charge.
  // The per-profile fee override (0 for the platform owner) is threaded in too.
  const tier = getChargedTier(tradieDetails?.subscription_tier);
  const fee = calculatePlatformFee(labour, tier, profile?.platform_fee_override_bps);
  const matProcessing = calculateMaterialsProcessing(materials);
  const receives = total - fee - matProcessing;
  const tierLabel = tier === 'free' ? 'Free' : 'Pro'; // pro & the retired pro_plus both show as Pro

  // Fee-exempt (e.g. the platform owner) with no materials: show a clean "no fee"
  // message rather than "$0.00 platform fee", which reads oddly.
  if (fee <= 0 && matProcessing <= 0) {
    return (
      <div className={`flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 ${className ?? ''}`}>
        <Info className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-800 leading-relaxed">
          No platform fee on this job — you receive the full{' '}
          <span className="font-semibold">{money(total)}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 ${className ?? ''}`}>
      <div className="flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-xs text-gray-600 leading-relaxed">
            You'll receive <span className="font-semibold text-gray-800">{money(receives)}</span> if you win.
          </p>

          <div className="space-y-0.5">
            {fee > 0 && (
              <p className="text-xs text-gray-500">
                Our fee — {tierLabel === 'Free' ? '8%' : '5%'} of your labour (inc GST):{' '}
                <span className="font-medium text-gray-700">−{money(fee)}</span>
              </p>
            )}
            {matProcessing > 0 && (
              <p className="text-xs text-gray-500">
                Card processing on materials — at cost:{' '}
                <span className="font-medium text-gray-700">−{money(matProcessing)}</span>
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            {materials > 0
              ? 'We take nothing on your materials. '
              : ''}
            Quoting is always free; the fee only applies when the job completes.
          </p>
        </div>
      </div>
    </div>
  );
}
