import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isReleaseActioned } from '../lib/paymentRelease';
import { buildPayoutSummary } from '../lib/payoutSummary';
import type { EscrowPayment, PayoutSummary } from '../lib/payoutSummary';
import type { ConnectAccountDetails } from '../lib/stripe';

// ─────────────────────────────────────────────────────────────────────────────
// The tradie's money, in one place.
//
// The Payouts page and Settings > Payments each used to work this out on their
// own, from different sources, and reported it in different words: Settings
// showed the raw Stripe balance ("$3.50 available / $1.00 pending") while
// Payouts showed earnings and payouts ("$70.40 / $64.90 / $65.90"). Not a single
// figure appeared on both screens, so the two read as contradictory accounts of
// the same money.
//
// Everything that tells a tradie where their money is MUST read it from here.
// ─────────────────────────────────────────────────────────────────────────────

/** An off-platform invoice the tradie was paid directly (bank transfer, cash). */
export interface ExternalPayment {
  id: string;
  amount: number; // cents
  paidAt: string;
  clientName: string;
  method: string | null;
  reference: string | null;
  service: string;
}

export interface TradieEarnings {
  summary: PayoutSummary;
  /** Soonest completed_at (ms epoch) still awaiting the client, for the countdown. */
  escrowReleaseAt: number | null;
  externalPayments: ExternalPayment[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_SUMMARY: PayoutSummary = {
  awaitingClient: 0,
  transit: { amount: 0, title: 'Heading to your bank', detail: 'Nothing in transit' },
  received: 0,
  earned: 0,
  inFlightArrival: null,
};

/**
 * @param userId          the signed-in tradie
 * @param accountDetails  already-loaded Connect details from the caller, so the
 *                        two screens never double-fetch Stripe. Pass null while
 *                        it is still loading.
 */
export function useTradieEarnings(
  userId: string | undefined,
  accountDetails: ConnectAccountDetails | null,
): TradieEarnings {
  const [escrowRows, setEscrowRows] = useState<EscrowPayment[]>([]);
  const [escrowReleaseAt, setEscrowReleaseAt] = useState<number | null>(null);
  const [externalPayments, setExternalPayments] = useState<ExternalPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      // Unreleased escrow: completed payments on a live job with no transfer yet.
      // A paid price increase is escrow too — same client money on the same job,
      // held under the same release — so it counts here or it disappears from
      // "Secured, awaiting approval" until the job releases.
      const { data: escrowData, error: escrowError } = await supabase
        .from('payments')
        .select('amount, metadata, jobs!inner(tradie_id, status, completed_at)')
        .eq('jobs.tradie_id', userId)
        .eq('status', 'completed')
        .in('payment_type', ['job_funding', 'price_adjustment'])
        .in('jobs.status', ['funded', 'in_progress', 'completed']);
      if (escrowError) throw escrowError;

      const unreleased = (escrowData || []).filter(
        (p) => !(p.metadata as Record<string, unknown>)?.transfer_id,
      );
      setEscrowRows(
        unreleased.map((p) => ({
          amount: p.amount,
          metadata: p.metadata as Record<string, unknown> | null,
        })),
      );

      // Only COMPLETED jobs STILL AWAITING THE CLIENT are inside the review
      // window; the soonest completed_at drives the next auto-release countdown.
      const completedTimes = unreleased
        .filter((p) => !isReleaseActioned({ metadata: p.metadata as Record<string, unknown> | null }))
        .map((p) => p.jobs as unknown as { status: string; completed_at: string | null })
        .filter((j) => j.status === 'completed' && j.completed_at)
        .map((j) => new Date(j.completed_at as string).getTime());
      setEscrowReleaseAt(completedTimes.length ? Math.min(...completedTimes) : null);

      // Externally-received payments: paid invoices settled off-platform.
      const { data: extInv, error: extError } = await supabase
        .from('recurring_invoices')
        .select('id, total, paid_at, created_at, external_payment_method, external_reference, client_contact_id, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category)')
        .eq('tradie_id', userId)
        .eq('payment_method', 'external')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false });
      if (extError) throw extError;

      if (extInv && extInv.length > 0) {
        const contactIds = [...new Set(extInv.map((i) => i.client_contact_id).filter((x): x is string => !!x))];
        let nameMap = new Map<string, string>();
        if (contactIds.length > 0) {
          const { data: contacts } = await supabase
            .from('client_contacts')
            .select('id, full_name')
            .in('id', contactIds);
          nameMap = new Map((contacts || []).map((c) => [c.id, c.full_name || 'Client']));
        }
        setExternalPayments(
          extInv.map((i) => {
            const rj = i.recurring_job as { trade_category?: string } | null;
            const service = (rj?.trade_category || 'Service')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            return {
              id: i.id,
              amount: Math.round(Number(i.total) * 100),
              paidAt: i.paid_at || i.created_at,
              clientName: (i.client_contact_id && nameMap.get(i.client_contact_id)) || 'Client',
              method: i.external_payment_method,
              reference: i.external_reference,
              service,
            };
          }),
        );
      } else {
        setExternalPayments([]);
      }
    } catch (err) {
      // A failed query must not silently read as "no money": leave the last known
      // rows in place rather than blanking the card to zeros.
      console.error('useTradieEarnings: could not load earnings', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const externalTotal = useMemo(
    () => externalPayments.reduce((s, p) => s + p.amount, 0),
    [externalPayments],
  );

  const summary = useMemo(() => {
    if (!accountDetails?.connected) return EMPTY_SUMMARY;
    return buildPayoutSummary({
      availableCents: accountDetails.balance?.available ?? 0,
      pendingCents: accountDetails.balance?.pending ?? 0,
      payouts: accountDetails.payouts ?? [],
      escrow: escrowRows,
      externalTotalCents: externalTotal,
      isManualSchedule: accountDetails.payoutSchedule?.interval === 'manual',
    });
  }, [accountDetails, escrowRows, externalTotal]);

  return { summary, escrowReleaseAt, externalPayments, loading, refresh };
}
