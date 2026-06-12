import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateFees,
  createJobDeposit,
  releaseEscrow,
  processRefund,
  payPriceIncrease,
  createBonusPayment,
  verifyPayment,
  acceptAndPay,
  payMilestone,
  createJobPaymentCheckout,
  requestPriceReduction,
  approvePriceReduction,
  adjustQuotePrice,
  humanizePaymentError,
  PLATFORM_FEE_RATE_FREE,
  PLATFORM_FEE_RATE_PRO,
  PROCESSING_FEE_RATE,
  STRIPE_FEE_RATE,
  STRIPE_FEE_FIXED_CENTS,
} from '../stripePayments';

// ---------------------------------------------------------------------------
// Mock ../edgeFn
// ---------------------------------------------------------------------------

vi.mock('../edgeFn', () => ({
  callEdgeFunction: vi.fn(),
}));

import { callEdgeFunction } from '../edgeFn';

// ---------------------------------------------------------------------------
// Mock ../supabase  (same pattern as stripePayments.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../supabase', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'gte', 'lte', 'maybeSingle', 'single'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain._response = { data: null, error: null };
    chain.then = function (resolve: (v: unknown) => void) {
      resolve((chain as Record<string, unknown>)._response);
      return Promise.resolve((chain as Record<string, unknown>)._response);
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn(() => mockChain()),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-123' } }, error: null }),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Mock window.location.origin
// ---------------------------------------------------------------------------

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, origin: 'https://app.connectradie.com.au' },
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests - Full Payment Lifecycle
// ---------------------------------------------------------------------------

describe('paymentFlows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Job funding flow (accept-and-pay)
  // =========================================================================

  describe('job funding flow (accept-and-pay)', () => {
    it('calls accept-and-pay edge function with quoteId and correct URLs', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_accept1',
        paymentId: 'pay-new-1',
      });

      const result = await acceptAndPay('quote-100', 'job-200');

      expect(callEdgeFunction).toHaveBeenCalledWith('accept-and-pay', expect.objectContaining({
        quoteId: 'quote-100',
        successUrl: 'https://app.connectradie.com.au/leads?payment=success&job_id=job-200',
        cancelUrl: 'https://app.connectradie.com.au/leads?payment=cancelled&job_id=job-200',
      }));
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/cs_test_accept1',
        paymentId: 'pay-new-1',
      });
    });

    it('passes agreedPrice when provided', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_agreed',
        paymentId: 'pay-agreed-1',
      });

      await acceptAndPay('quote-101', 'job-201', 45000);

      expect(callEdgeFunction).toHaveBeenCalledWith('accept-and-pay', expect.objectContaining({
        quoteId: 'quote-101',
        agreedPrice: 45000,
      }));
    });

    it('includes an idempotency key to prevent duplicate submissions', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_idemp',
        paymentId: 'pay-idemp-1',
      });

      await acceptAndPay('quote-102', 'job-202');

      expect(callEdgeFunction).toHaveBeenCalledWith('accept-and-pay', expect.objectContaining({
        idempotencyKey: expect.any(String),
      }));
    });

    it('throws when no checkout URL is returned', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: '', paymentId: '' });

      await expect(acceptAndPay('quote-bad', 'job-bad')).rejects.toThrow(
        'No checkout URL received from accept-and-pay',
      );
    });

    it('createJobDeposit builds correct success/return URLs with jobId', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_deposit',
      });

      await createJobDeposit('job-url-test', 15000);

      expect(callEdgeFunction).toHaveBeenCalledWith('create-job-deposit', expect.objectContaining({
        jobId: 'job-url-test',
        amountCents: 15000,
        successUrl: 'https://app.connectradie.com.au/jobs?payment=success&job_id=job-url-test',
        cancelUrl: 'https://app.connectradie.com.au/jobs?payment=cancelled&job_id=job-url-test',
      }));
    });

    it('propagates edge function errors for accept-and-pay', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(new Error('Quote already accepted'));

      await expect(acceptAndPay('quote-dup', 'job-dup')).rejects.toThrow('Quote already accepted');
    });
  });

  // =========================================================================
  // 2. Release escrow flow
  // =========================================================================

  describe('release escrow flow', () => {
    it('sends correct paymentId to release-escrow', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: true });

      const result = await releaseEscrow('pay-escrow-1');

      expect(callEdgeFunction).toHaveBeenCalledWith('release-escrow', expect.objectContaining({
        paymentId: 'pay-escrow-1',
      }));
      expect(result).toEqual({ success: true });
    });

    it('includes an idempotency key to prevent double release', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: true });

      await releaseEscrow('pay-escrow-2');

      expect(callEdgeFunction).toHaveBeenCalledWith('release-escrow', expect.objectContaining({
        idempotencyKey: expect.any(String),
      }));
    });

    it('returns failure when payment cannot be released', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: false });

      const result = await releaseEscrow('pay-escrow-locked');

      expect(result).toEqual({ success: false });
    });

    it('throws on non-existent payment', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Payment not found'),
      );

      await expect(releaseEscrow('pay-nonexistent')).rejects.toThrow('Payment not found');
    });

    it('throws on already-released payment', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Payment has already been released'),
      );

      await expect(releaseEscrow('pay-already-released')).rejects.toThrow(
        'Payment has already been released',
      );
    });
  });

  // =========================================================================
  // 3. Refund flow
  // =========================================================================

  describe('refund flow', () => {
    it('sends correct paymentId and reason to process-refund', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        success: true,
        refundId: 're_test_full_refund',
      });

      const result = await processRefund('pay-refund-1', 'Work not completed');

      expect(callEdgeFunction).toHaveBeenCalledWith('process-refund', expect.objectContaining({
        paymentId: 'pay-refund-1',
        reason: 'Work not completed',
      }));
      expect(result).toEqual({ success: true, refundId: 're_test_full_refund' });
    });

    it('sends null reason when none provided', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        success: true,
        refundId: 're_test_no_reason',
      });

      await processRefund('pay-refund-2');

      expect(callEdgeFunction).toHaveBeenCalledWith('process-refund', expect.objectContaining({
        paymentId: 'pay-refund-2',
        reason: null,
      }));
    });

    it('includes an idempotency key for refund calls', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: true, refundId: 're_idemp' });

      await processRefund('pay-refund-3', 'Duplicate');

      expect(callEdgeFunction).toHaveBeenCalledWith('process-refund', expect.objectContaining({
        idempotencyKey: expect.any(String),
      }));
    });

    it('throws when payment not found for refund', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Payment not found'),
      );

      await expect(processRefund('pay-gone')).rejects.toThrow('Payment not found');
    });

    it('throws when payment already refunded', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Payment has already been refunded'),
      );

      await expect(processRefund('pay-already-refunded')).rejects.toThrow(
        'Payment has already been refunded',
      );
    });

    it('returns failure without refundId on declined refund', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: false });

      const result = await processRefund('pay-declined-refund', 'Changed mind');

      expect(result).toEqual({ success: false });
      expect(result.refundId).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Price increase flow
  // =========================================================================

  describe('price increase flow', () => {
    it('sends correct paymentId and jobId to pay-price-increase', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_increase',
        paymentId: 'pay-increase-1',
      });

      const result = await payPriceIncrease('pay-orig-1', 'job-increase-1');

      expect(callEdgeFunction).toHaveBeenCalledWith('pay-price-increase', expect.objectContaining({
        paymentId: 'pay-orig-1',
        successUrl: 'https://app.connectradie.com.au/leads?payment=success&job_id=job-increase-1',
        cancelUrl: 'https://app.connectradie.com.au/leads?payment=cancelled&job_id=job-increase-1',
      }));
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/cs_test_increase',
        paymentId: 'pay-increase-1',
      });
    });

    it('includes an idempotency key', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_increase2',
        paymentId: 'pay-increase-2',
      });

      await payPriceIncrease('pay-orig-2', 'job-increase-2');

      expect(callEdgeFunction).toHaveBeenCalledWith('pay-price-increase', expect.objectContaining({
        idempotencyKey: expect.any(String),
      }));
    });

    it('throws when no checkout URL returned for price increase', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: '', paymentId: '' });

      await expect(payPriceIncrease('pay-no-url', 'job-no-url')).rejects.toThrow(
        'No checkout URL received from pay-price-increase',
      );
    });

    it('propagates edge function errors for price increase', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Original payment not found'),
      );

      await expect(payPriceIncrease('pay-missing', 'job-missing')).rejects.toThrow(
        'Original payment not found',
      );
    });
  });

  // =========================================================================
  // 5. Bonus payment flow
  // =========================================================================

  describe('bonus payment flow', () => {
    it('creates bonus with correct originalPaymentId, amount, and jobId', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_bonus',
        paymentId: 'pay-bonus-1',
      });

      const result = await createBonusPayment('pay-orig-bonus', 5000, 'job-bonus-1');

      expect(callEdgeFunction).toHaveBeenCalledWith('create-bonus-payment', expect.objectContaining({
        originalPaymentId: 'pay-orig-bonus',
        bonusAmount: 5000,
        successUrl: 'https://app.connectradie.com.au/payments?bonus=success&job_id=job-bonus-1',
        cancelUrl: 'https://app.connectradie.com.au/dashboard?bonus=cancelled&job_id=job-bonus-1',
      }));
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/cs_test_bonus',
        paymentId: 'pay-bonus-1',
      });
    });

    it('includes an idempotency key for bonus payment', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_bonus2',
        paymentId: 'pay-bonus-2',
      });

      await createBonusPayment('pay-orig-bonus2', 2000, 'job-bonus-2');

      expect(callEdgeFunction).toHaveBeenCalledWith('create-bonus-payment', expect.objectContaining({
        idempotencyKey: expect.any(String),
      }));
    });

    it('throws when no checkout URL returned for bonus', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: '', paymentId: '' });

      await expect(createBonusPayment('pay-no-bonus', 1000, 'job-no-bonus')).rejects.toThrow(
        'No checkout URL received from create-bonus-payment',
      );
    });

    it('propagates error when tradie has no Connect account', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Tradie does not have a connected Stripe account'),
      );

      await expect(createBonusPayment('pay-no-connect', 3000, 'job-no-connect')).rejects.toThrow(
        'Tradie does not have a connected Stripe account',
      );
    });
  });

  // =========================================================================
  // 6. Payment verification
  // =========================================================================

  describe('payment verification', () => {
    it('confirms successful payment', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        status: 'completed',
        message: 'Payment verified successfully',
        verified_via: 'stripe_session',
      });

      const result = await verifyPayment('pay-verify-1');

      expect(callEdgeFunction).toHaveBeenCalledWith('verify-payment', { paymentId: 'pay-verify-1' });
      expect(result).toEqual({
        status: 'completed',
        message: 'Payment verified successfully',
        verified_via: 'stripe_session',
      });
    });

    it('detects failed payment', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        status: 'failed',
        message: 'Payment was declined by the card issuer',
      });

      const result = await verifyPayment('pay-verify-failed');

      expect(result.status).toBe('failed');
      expect(result.message).toBe('Payment was declined by the card issuer');
    });

    it('handles expired checkout session', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        status: 'expired',
        message: 'Checkout session has expired',
      });

      const result = await verifyPayment('pay-verify-expired');

      expect(result.status).toBe('expired');
      expect(result.message).toBe('Checkout session has expired');
    });

    it('handles payment still in escrow', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        status: 'escrow',
        message: 'Payment is held in escrow',
        verified_via: 'database',
      });

      const result = await verifyPayment('pay-verify-escrow');

      expect(result.status).toBe('escrow');
      expect(result.verified_via).toBe('database');
    });

    it('propagates edge function error for verify', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Edge function "verify-payment" failed (500)'),
      );

      await expect(verifyPayment('pay-verify-err')).rejects.toThrow(
        'Edge function "verify-payment" failed (500)',
      );
    });
  });

  // =========================================================================
  // 7. Fee calculation edge cases
  // =========================================================================

  describe('fee calculation edge cases', () => {
    it('GST-registered tradie on free tier gets correct calculations', () => {
      // $1,000.00 = 100_000 cents, free tier
      const result = calculateFees(100_000, false);

      expect(result.baseCents).toBe(100_000);
      expect(result.processingFee).toBe(Math.round(100_000 * PROCESSING_FEE_RATE));
      expect(result.platformFee).toBe(Math.round(100_000 * PLATFORM_FEE_RATE_FREE));
      expect(result.stripeFee).toBe(Math.round(100_000 * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS);
      expect(result.tradiePayout).toBe(100_000 - result.platformFee);
    });

    it('GST-registered tradie on pro tier gets reduced platform fee', () => {
      const result = calculateFees(100_000, true);

      expect(result.platformFee).toBe(Math.round(100_000 * PLATFORM_FEE_RATE_PRO));
      expect(result.tradiePayout).toBe(100_000 - result.platformFee);
      // Pro tradie keeps more than free tradie
      const freeResult = calculateFees(100_000, false);
      expect(result.tradiePayout).toBeGreaterThan(freeResult.tradiePayout);
    });

    it('handles very small amount under $1 (50 cents)', () => {
      const result = calculateFees(50, false);

      expect(result.baseCents).toBe(50);
      expect(result.processingFee).toBe(Math.round(50 * PROCESSING_FEE_RATE));
      expect(result.platformFee).toBe(Math.round(50 * PLATFORM_FEE_RATE_FREE));
      expect(result.stripeFee).toBe(Math.round(50 * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS);
      // Fixed 30c portion dwarfs the percentage portion for tiny amounts
      expect(STRIPE_FEE_FIXED_CENTS).toBeGreaterThan(Math.round(50 * STRIPE_FEE_RATE));
    });

    it('handles maximum reasonable amount ($100,000 = 10_000_000 cents)', () => {
      const result = calculateFees(10_000_000, false);

      expect(result.baseCents).toBe(10_000_000);
      expect(result.processingFee).toBe(Math.round(10_000_000 * PROCESSING_FEE_RATE));
      expect(result.platformFee).toBe(Math.round(10_000_000 * PLATFORM_FEE_RATE_FREE));
      expect(result.stripeFee).toBe(Math.round(10_000_000 * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS);
      expect(result.totalCharge).toBe(result.baseCents + result.processingFee + result.stripeFee);
      expect(result.tradiePayout).toBe(result.baseCents - result.platformFee);
    });

    it('fractional cent rounding: $7.77 free tier', () => {
      // $7.77 = 777 cents - causes fractional cents in all fee tiers
      const result = calculateFees(777, false);

      expect(result.baseCents).toBe(777);
      expect(result.processingFee).toBe(Math.round(777 * PROCESSING_FEE_RATE));
      expect(result.platformFee).toBe(Math.round(777 * PLATFORM_FEE_RATE_FREE));
      expect(result.stripeFee).toBe(Math.round(777 * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS);
      // All values must be whole integers (no fractional cents)
      expect(Number.isInteger(result.processingFee)).toBe(true);
      expect(Number.isInteger(result.platformFee)).toBe(true);
      expect(Number.isInteger(result.stripeFee)).toBe(true);
      expect(Number.isInteger(result.totalCharge)).toBe(true);
      expect(Number.isInteger(result.tradiePayout)).toBe(true);
    });

    it('fractional cent rounding: $33.33 pro tier', () => {
      const result = calculateFees(3333, true);

      expect(Number.isInteger(result.processingFee)).toBe(true);
      expect(Number.isInteger(result.platformFee)).toBe(true);
      expect(Number.isInteger(result.stripeFee)).toBe(true);
      expect(Number.isInteger(result.totalCharge)).toBe(true);
      expect(Number.isInteger(result.tradiePayout)).toBe(true);
      // totalCharge = base + processing + stripe
      expect(result.totalCharge).toBe(result.baseCents + result.processingFee + result.stripeFee);
    });

    it('1 cent amount: minimum possible payment', () => {
      const result = calculateFees(1, false);

      expect(result.baseCents).toBe(1);
      expect(result.processingFee).toBe(Math.round(1 * PROCESSING_FEE_RATE));
      expect(result.platformFee).toBe(Math.round(1 * PLATFORM_FEE_RATE_FREE));
      // Fixed stripe fee dominates
      expect(result.stripeFee).toBe(Math.round(1 * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS);
      expect(result.totalCharge).toBeGreaterThan(result.baseCents);
    });
  });

  // =========================================================================
  // 8. Additional lifecycle tests (checkout, reduction, quote adjustment)
  // =========================================================================

  describe('payment checkout for existing record', () => {
    it('creates checkout session for existing pending payment', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_existing',
      });

      const result = await createJobPaymentCheckout('pay-pending-1');

      expect(callEdgeFunction).toHaveBeenCalledWith('create-job-payment-checkout', expect.objectContaining({
        paymentId: 'pay-pending-1',
        idempotencyKey: expect.any(String),
        successUrl: 'https://app.connectradie.com.au/payments?payment=success&payment_id=pay-pending-1',
        cancelUrl: 'https://app.connectradie.com.au/payments?payment=cancelled&payment_id=pay-pending-1',
      }));
      expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_test_existing' });
    });

    it('throws when no checkout URL returned', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: null });

      await expect(createJobPaymentCheckout('pay-bad-checkout')).rejects.toThrow(
        'No checkout URL received',
      );
    });
  });

  describe('price reduction flow', () => {
    it('requests price reduction with correct params', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        success: true,
        proposedAmount: 8000,
        refundAmount: 2000,
      });

      const result = await requestPriceReduction('pay-reduce-1', 8000, 'Overpaid by mistake');

      expect(callEdgeFunction).toHaveBeenCalledWith('client-request-reduction', {
        paymentId: 'pay-reduce-1',
        newTotal: 8000,
        reason: 'Overpaid by mistake',
      });
      expect(result).toEqual({
        success: true,
        proposedAmount: 8000,
        refundAmount: 2000,
      });
    });

    it('sends null reason when not provided', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        success: true,
        proposedAmount: 5000,
        refundAmount: 5000,
      });

      await requestPriceReduction('pay-reduce-2', 5000);

      expect(callEdgeFunction).toHaveBeenCalledWith('client-request-reduction', {
        paymentId: 'pay-reduce-2',
        newTotal: 5000,
        reason: null,
      });
    });
  });

  describe('approve/decline price reduction', () => {
    it('approves reduction and returns refund details', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        action: 'approved',
        refundId: 're_test_approved',
        refundAmount: 2000,
        newTotal: 8000,
      });

      const result = await approvePriceReduction('pay-approval-1', true);

      expect(callEdgeFunction).toHaveBeenCalledWith('approve-price-reduction', {
        paymentId: 'pay-approval-1',
        approve: true,
      });
      expect(result).toEqual({
        action: 'approved',
        refundId: 're_test_approved',
        refundAmount: 2000,
        newTotal: 8000,
      });
    });

    it('declines reduction', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        action: 'declined',
      });

      const result = await approvePriceReduction('pay-approval-2', false);

      expect(result.action).toBe('declined');
      expect(result.refundId).toBeUndefined();
    });
  });

  describe('quote price adjustment', () => {
    it('adjusts quote price down and returns refund info', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        action: 'decreased',
        finalPrice: 8000,
        refundAmount: 2000,
      });

      const result = await adjustQuotePrice('quote-adj-1', 8000);

      expect(callEdgeFunction).toHaveBeenCalledWith('adjust-quote-price', {
        quoteId: 'quote-adj-1',
        finalPrice: 8000,
      });
      expect(result).toEqual({
        action: 'decreased',
        finalPrice: 8000,
        refundAmount: 2000,
      });
    });

    it('adjusts quote price up and returns additional amount', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        action: 'increased',
        finalPrice: 15000,
        additionalAmount: 5000,
      });

      const result = await adjustQuotePrice('quote-adj-2', 15000);

      expect(result.action).toBe('increased');
      expect(result.additionalAmount).toBe(5000);
    });
  });

  // =========================================================================
  // 9. humanizePaymentError
  // =========================================================================

  describe('humanizePaymentError', () => {
    it('returns fallback for null/undefined message', () => {
      const result = humanizePaymentError(null);
      expect(result).toContain("couldn't process");

      const result2 = humanizePaymentError(undefined);
      expect(result2).toContain("couldn't process");
    });

    it('humanizes insufficient funds error', () => {
      const result = humanizePaymentError('Transfer failed: insufficient funds in platform account');
      expect(result).toContain('temporary platform balance issue');
    });

    it('strips Stripe test card references', () => {
      const result = humanizePaymentError('Use the 4000000000000077 test card for this scenario');
      expect(result).toContain("couldn't process");
      expect(result).not.toContain('4000000000000077');
    });

    it('strips stripe.com URLs', () => {
      const result = humanizePaymentError('See https://stripe.com/docs/testing for details');
      expect(result).toContain("couldn't process");
      expect(result).not.toContain('stripe.com');
    });

    it('humanizes account_invalid error', () => {
      const result = humanizePaymentError('account_invalid: Stripe account is not active');
      expect(result).toContain("payout account isn't fully set up");
    });

    it('passes through normal error messages unchanged', () => {
      const msg = 'Job has been cancelled by the homeowner';
      const result = humanizePaymentError(msg);
      expect(result).toBe(msg);
    });
  });

  // =========================================================================
  // 10. Milestone payment
  // =========================================================================

  describe('milestone payment flow', () => {
    it('pays milestone with correct URLs', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        url: 'https://checkout.stripe.com/cs_test_ms_pay',
      });

      const result = await payMilestone('ms-500');

      expect(callEdgeFunction).toHaveBeenCalledWith('pay-milestone', expect.objectContaining({
        milestoneId: 'ms-500',
        idempotencyKey: expect.any(String),
        successUrl: 'https://app.connectradie.com.au/jobs?payment=success&milestone_id=ms-500',
        cancelUrl: 'https://app.connectradie.com.au/jobs?payment=cancelled&milestone_id=ms-500',
      }));
      expect(result).toEqual({ url: 'https://checkout.stripe.com/cs_test_ms_pay' });
    });

    it('throws when milestone checkout URL is empty', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: '' });

      await expect(payMilestone('ms-empty')).rejects.toThrow(
        'No checkout URL received from pay-milestone',
      );
    });
  });
});
