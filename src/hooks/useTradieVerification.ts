import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { tradeRequiresLicense } from '../lib/tradeCategories';

interface VerificationState {
  identity: boolean;
  abn: boolean;
  license: boolean;
  tradeInLicensedList: boolean;
  verifiedTrades: string[];
}

export interface TradieVerificationResult {
  loading: boolean;
  canQuote: boolean;
  blockingReasons: string[];
  requiresLicense: boolean;
  verification: VerificationState;
}

const EMPTY_STATE: VerificationState = {
  identity: false,
  abn: false,
  license: false,
  tradeInLicensedList: false,
  verifiedTrades: [],
};

/**
 * Determines whether the current tradie may submit a quote on the given trade.
 *
 * Gate logic:
 * - All trades require ABN verification (the baseline business-legitimacy
 *   signal — Australian businesses must have an ABN, and we verify it via the
 *   ABR Lookup at signup).
 * - Licensed trades (plumber, electrician, builder, etc.) additionally require
 *   license_verified AND the trade to be in verified_trades[].
 * - Identity verification (Stripe Identity) is tracked separately and surfaced
 *   as a "Pro Verified" badge but NOT a gating requirement — most legitimate
 *   tradies won't have completed it, and blocking on it would gut the supply
 *   side.
 *
 * Pass `null` or `undefined` for trade to get raw verification state without
 * trade-specific licence check (useful for general "am I verified at all" UI).
 */
export function useTradieVerification(trade: string | null | undefined): TradieVerificationResult {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<VerificationState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setState(EMPTY_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_identity_verified, abn_verified, license_verified, verified_trades')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setState(EMPTY_STATE);
        setLoading(false);
        return;
      }

      const verifiedTrades = (data.verified_trades as string[] | null) ?? [];
      setState({
        identity: !!data.is_identity_verified,
        abn: !!data.abn_verified,
        license: !!data.license_verified,
        tradeInLicensedList: trade ? verifiedTrades.includes(trade) : false,
        verifiedTrades,
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user?.id, trade]);

  const requiresLicense = tradeRequiresLicense(trade);
  const blockingReasons: string[] = [];
  if (!state.abn) blockingReasons.push('ABN verification');
  if (requiresLicense) {
    if (!state.license) blockingReasons.push('Contractor licence');
    else if (trade && !state.tradeInLicensedList) blockingReasons.push(`Your licence isn't endorsed for ${trade}`);
  }

  return {
    loading,
    canQuote: !loading && blockingReasons.length === 0,
    blockingReasons,
    requiresLicense,
    verification: state,
  };
}
