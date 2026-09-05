import { useEffect, useState } from 'react';
import { BadgeCheck, Receipt } from 'lucide-react';
import { fetchVerificationBadges, formatExpiryMonth, type VerificationBadges as Badges } from '../../lib/verification';

interface VerificationBadgesProps {
  tradieId: string;
  className?: string;
}

/**
 * Public-profile badges backed by get_tradie_verification_badges(): "GST
 * registered" (a public ABR fact) and "Licence verified" with state and expiry
 * MONTH only. The licence number is never shown publicly — the RPC does not
 * even return it.
 */
export default function VerificationBadges({ tradieId, className = '' }: VerificationBadgesProps) {
  const [badges, setBadges] = useState<Badges | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVerificationBadges(tradieId).then((b) => {
      if (!cancelled) setBadges(b);
    });
    return () => { cancelled = true; };
  }, [tradieId]);

  if (!badges || (!badges.gst_registered && !badges.licence_verified)) return null;

  const expiry = formatExpiryMonth(badges.licence_expiry_month);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {badges.licence_verified && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30"
          title={`Trade licence checked against the ${badges.licence_state ?? ''} register`.trim()}
        >
          <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
          Licence verified{badges.licence_state ? ` · ${badges.licence_state}` : ''}{expiry ? ` · to ${expiry}` : ''}
        </span>
      )}
      {badges.gst_registered && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-ct-surface-2 text-ct-mute-2 border-ct-line"
          title="Registered for GST on the Australian Business Register"
        >
          <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
          GST registered
        </span>
      )}
    </div>
  );
}
