import { describe, it, expect } from 'vitest';
import { buildPayoutSummary } from '../payoutSummary';
import type { PayoutSummaryInput } from '../payoutSummary';

const base: PayoutSummaryInput = {
  availableCents: 0,
  pendingCents: 0,
  payouts: [],
  escrow: [],
  externalTotalCents: 0,
  isManualSchedule: true,
};

// 28 Jul 2026, the arrival date in the reported screenshot.
const ARRIVAL = Math.floor(Date.UTC(2026, 6, 28, 3, 0, 0) / 1000);

describe('buildPayoutSummary', () => {
  it('reproduces the reported account without double-counting the in-transit payout', () => {
    // Real production state: a $70 job released ($64.90 net) and still in
    // transit, an earlier $1.00 payout received, $4.50 left in the balance.
    const s = buildPayoutSummary({
      ...base,
      availableCents: 350,
      pendingCents: 100,
      payouts: [
        { amount: 6490, status: 'in_transit', arrival_date: ARRIVAL },
        { amount: 100, status: 'paid', arrival_date: ARRIVAL - 86400 },
      ],
    });

    expect(s.awaitingClient).toBe(0);
    expect(s.transit.amount).toBe(6940); // 64.90 in flight + 4.50 in balance
    expect(s.received).toBe(100); // NOT 6590 — the in-transit payout isn't received
    expect(s.earned).toBe(7040);
    expect(s.transit.title).toBe('Heading to your bank');
    expect(s.transit.detail).toContain('$64.90 should arrive by');
    expect(s.transit.detail).toContain('$3.50 cleared, not sent yet');
    expect(s.transit.detail).toContain('$1.00 still clearing');
  });

  it('always makes the three rows sum to the headline', () => {
    const s = buildPayoutSummary({
      ...base,
      availableCents: 12_000,
      pendingCents: 3_000,
      payouts: [
        { amount: 5_000, status: 'pending', arrival_date: ARRIVAL },
        { amount: 9_000, status: 'paid', arrival_date: ARRIVAL },
      ],
      escrow: [{ amount: 20_000, metadata: { flow: 'destination', gst: '0', platform_fee: 1_000 } }],
      externalTotalCents: 2_500,
    });

    expect(s.awaitingClient + s.transit.amount + s.received).toBe(s.earned);
  });

  it('does not count failed or canceled payouts as received', () => {
    const s = buildPayoutSummary({
      ...base,
      availableCents: 5_000, // the failed payout's funds bounced back to here
      payouts: [
        { amount: 5_000, status: 'failed', arrival_date: ARRIVAL },
        { amount: 2_000, status: 'canceled', arrival_date: ARRIVAL },
        { amount: 1_500, status: 'paid', arrival_date: ARRIVAL },
      ],
    });

    expect(s.received).toBe(1_500);
    expect(s.transit.amount).toBe(5_000);
    expect(s.earned).toBe(6_500); // not 13_500
  });

  it('shows destination escrow awaiting approval in one row only', () => {
    // $100 job, $10 platform fee → $90 credited to the Connect balance while the
    // client decides. It is "secured" (row 1); it must not also read as money
    // heading to the bank (row 2).
    const s = buildPayoutSummary({
      ...base,
      availableCents: 9_000,
      escrow: [{ amount: 10_000, metadata: { flow: 'destination', gst: '0', platform_fee: 1_000 } }],
    });

    expect(s.awaitingClient).toBe(9_000);
    expect(s.transit.amount).toBe(0);
    expect(s.transit.detail).toBe('Nothing in transit');
    expect(s.earned).toBe(9_000);
  });

  it('treats routing:destination the same as flow:destination', () => {
    // Off-app funded jobs (public-quote / invoice-contact) stamp `routing`.
    const s = buildPayoutSummary({
      ...base,
      availableCents: 9_000,
      escrow: [{ amount: 10_000, metadata: { routing: 'destination', gst: '0', platform_fee: 1_000 } }],
    });

    expect(s.earned).toBe(9_000); // not 18_000
  });

  it('counts escrow the client has already approved as in transit, not awaiting', () => {
    const s = buildPayoutSummary({
      ...base,
      availableCents: 9_000,
      escrow: [
        {
          amount: 10_000,
          metadata: { flow: 'destination', gst: '0', platform_fee: 1_000, release_approved_at: '2026-07-27T00:00:00Z' },
        },
      ],
    });

    expect(s.awaitingClient).toBe(0);
    expect(s.transit.amount).toBe(9_000);
    expect(s.transit.title).toBe('Ready to pay out');
  });

  it('adds GST to the balance credit and never returns a negative row', () => {
    // GST is a string in accept-and-pay metadata, a number in pay-price-increase.
    const s = buildPayoutSummary({
      ...base,
      escrow: [
        { amount: 10_000, metadata: { flow: 'destination', gst: '1000', platform_fee: 500 } },
        { amount: 10_000, metadata: { flow: 'destination', gst: 1_000, platform_fee: 500 } },
      ],
    });

    expect(s.awaitingClient).toBe(21_000);
  });

  it('falls back to the gross amount when fee metadata is missing', () => {
    const s = buildPayoutSummary({
      ...base,
      escrow: [{ amount: 10_000, metadata: { flow: 'destination' } }],
    });

    expect(s.awaitingClient).toBe(10_000);
  });

  it('names the scheduled state when the account is not on a manual schedule', () => {
    const s = buildPayoutSummary({ ...base, availableCents: 4_000, isManualSchedule: false });

    expect(s.transit.title).toBe('Scheduled for your next payout');
    expect(s.transit.amount).toBe(4_000);
  });
});
