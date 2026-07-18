import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createJobDeposit,
  payMilestone,
  releaseEscrow,
  processRefund,
  getPaymentHistory,
  getPaymentById,
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
// Mock ../supabase  (same pattern as reviews.test.ts)
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

import { supabase } from '../supabase';

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
// Helpers
// ---------------------------------------------------------------------------

/** Build a supabase chain mock that resolves to the given response. */
function mockFromChain(response: { data: unknown; error: unknown }, methods: string[] = []) {
  const allMethods = ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'gte', 'lte', 'maybeSingle', 'single', ...methods];
  const chain: Record<string, unknown> = {};
  for (const m of allMethods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = function (resolve: (v: unknown) => void) {
    resolve(response);
    return Promise.resolve(response);
  };
  return chain as unknown as ReturnType<typeof supabase.from>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripePayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Fee constants
  // =========================================================================

  describe('fee constants', () => {
    it('has correct processing fee rate (3.5% = 1.75% Stripe + 1.75% platform margin)', () => {
      expect(PROCESSING_FEE_RATE).toBe(0.035);
    });

    it('has correct Stripe fee rate (1.75%)', () => {
      expect(STRIPE_FEE_RATE).toBe(0.0175);
    });

    it('has correct Stripe fixed fee (30c)', () => {
      expect(STRIPE_FEE_FIXED_CENTS).toBe(30);
    });
  });

  // =========================================================================
  // createJobDeposit
  // =========================================================================

  describe('createJobDeposit', () => {
    it('calls edge function with correct parameters and returns URL', async () => {
      const mockUrl = 'https://checkout.stripe.com/session/cs_test_abc123';
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: mockUrl });

      const result = await createJobDeposit('job-456', 25000);

      expect(callEdgeFunction).toHaveBeenCalledWith('create-job-deposit', expect.objectContaining({
        jobId: 'job-456',
        amountCents: 25000,
        successUrl: 'https://app.connectradie.com.au/jobs?payment=success&job_id=job-456',
        cancelUrl: 'https://app.connectradie.com.au/jobs?payment=cancelled&job_id=job-456',
      }));
      expect(result).toEqual({ url: mockUrl });
    });

    it('throws when no checkout URL is returned', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: '' });

      await expect(createJobDeposit('job-789', 10000)).rejects.toThrow(
        'No checkout URL received from create-job-deposit'
      );
    });

    it('throws when edge function returns undefined url', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({});

      await expect(createJobDeposit('job-000', 5000)).rejects.toThrow(
        'No checkout URL received from create-job-deposit'
      );
    });

    it('propagates edge function errors', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(new Error('Network error'));

      await expect(createJobDeposit('job-err', 10000)).rejects.toThrow('Network error');
    });
  });

  // =========================================================================
  // payMilestone
  // =========================================================================

  describe('payMilestone', () => {
    it('calls edge function with correct parameters and returns URL', async () => {
      const mockUrl = 'https://checkout.stripe.com/session/cs_test_milestone_1';
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: mockUrl });

      const result = await payMilestone('milestone-100');

      expect(callEdgeFunction).toHaveBeenCalledWith('pay-milestone', expect.objectContaining({
        milestoneId: 'milestone-100',
        successUrl: 'https://app.connectradie.com.au/jobs?payment=success&milestone_id=milestone-100',
        cancelUrl: 'https://app.connectradie.com.au/jobs?payment=cancelled&milestone_id=milestone-100',
      }));
      expect(result).toEqual({ url: mockUrl });
    });

    it('throws when no checkout URL is returned', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ url: null });

      await expect(payMilestone('ms-bad')).rejects.toThrow(
        'No checkout URL received from pay-milestone'
      );
    });

    it('propagates edge function errors', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Edge function "pay-milestone" failed (500)')
      );

      await expect(payMilestone('ms-fail')).rejects.toThrow(
        'Edge function "pay-milestone" failed (500)'
      );
    });
  });

  // =========================================================================
  // releaseEscrow
  // =========================================================================

  describe('releaseEscrow', () => {
    it('calls edge function and returns success', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: true });

      const result = await releaseEscrow('pay-001');

      expect(callEdgeFunction).toHaveBeenCalledWith('release-escrow', expect.objectContaining({ paymentId: 'pay-001' }));
      expect(result).toEqual({ success: true });
    });

    it('returns failure from edge function', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: false });

      const result = await releaseEscrow('pay-002');

      expect(result).toEqual({ success: false });
    });

    it('propagates edge function errors', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(new Error('Payment not found'));

      await expect(releaseEscrow('pay-nonexistent')).rejects.toThrow('Payment not found');
    });
  });

  // =========================================================================
  // processRefund
  // =========================================================================

  describe('processRefund', () => {
    it('calls edge function with paymentId and reason', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({
        success: true,
        refundId: 're_test_abc123',
      });

      const result = await processRefund('pay-100', 'Client requested cancellation');

      expect(callEdgeFunction).toHaveBeenCalledWith('process-refund', expect.objectContaining({
        paymentId: 'pay-100',
        reason: 'Client requested cancellation',
      }));
      expect(result).toEqual({ success: true, refundId: 're_test_abc123' });
    });

    it('passes null reason when none is provided', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: true, refundId: 're_test_xyz' });

      await processRefund('pay-200');

      expect(callEdgeFunction).toHaveBeenCalledWith('process-refund', expect.objectContaining({
        paymentId: 'pay-200',
        reason: null,
      }));
    });

    it('handles refund failure', async () => {
      vi.mocked(callEdgeFunction).mockResolvedValue({ success: false });

      const result = await processRefund('pay-300', 'Duplicate charge');

      expect(result).toEqual({ success: false });
      expect(result.refundId).toBeUndefined();
    });

    it('propagates edge function errors', async () => {
      vi.mocked(callEdgeFunction).mockRejectedValue(
        new Error('Refund amount exceeds original payment')
      );

      await expect(processRefund('pay-err')).rejects.toThrow(
        'Refund amount exceeds original payment'
      );
    });
  });

  // =========================================================================
  // getPaymentHistory
  // =========================================================================

  describe('getPaymentHistory', () => {
    const mockPayments = [
      {
        id: 'pay-1',
        profile_id: 'test-user-123',
        job_id: 'job-1',
        payment_type: 'deposit',
        amount: 25000,
        processing_fee: 500,
        currency: 'aud',
        status: 'completed',
        stripe_payment_intent_id: 'pi_test_1',
        stripe_checkout_session_id: 'cs_test_1',
        metadata: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        job: { id: 'job-1', description: 'Fix plumbing', status: 'completed', trade_category: 'plumbing' },
      },
      {
        id: 'pay-2',
        profile_id: 'test-user-123',
        job_id: 'job-2',
        payment_type: 'milestone',
        amount: 50000,
        processing_fee: 1000,
        currency: 'aud',
        status: 'escrow',
        stripe_payment_intent_id: 'pi_test_2',
        stripe_checkout_session_id: 'cs_test_2',
        metadata: { milestone: 'Phase 1' },
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        job: { id: 'job-2', description: 'Kitchen renovation', status: 'in_progress', trade_category: 'carpentry' },
      },
    ];

    it('fetches payment history for the current user when no userId given', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: mockPayments, error: null })
      );

      const result = await getPaymentHistory();

      expect(supabase.auth.getUser).toHaveBeenCalled();
      expect(supabase.from).toHaveBeenCalledWith('payments');
      expect(result).toEqual(mockPayments);
      expect(result).toHaveLength(2);
    });

    it('fetches payment history for a specific user', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: mockPayments, error: null })
      );

      const result = await getPaymentHistory('specific-user-id');

      // Should NOT call getUser when userId is provided
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
      expect(supabase.from).toHaveBeenCalledWith('payments');
      expect(result).toEqual(mockPayments);
    });

    it('throws when user is not authenticated and no userId given', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: null },
        error: null,
      } as never);

      await expect(getPaymentHistory()).rejects.toThrow('Not authenticated');
    });

    it('throws on database error', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: null, error: { message: 'relation "payments" does not exist' } })
      );

      await expect(getPaymentHistory('user-abc')).rejects.toThrow(
        'relation "payments" does not exist'
      );
    });

    it('returns empty array when no payments exist', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: [], error: null })
      );

      const result = await getPaymentHistory('user-no-payments');
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getPaymentById
  // =========================================================================

  describe('getPaymentById', () => {
    const mockPayment = {
      id: 'pay-single',
      profile_id: 'user-xyz',
      job_id: 'job-10',
      payment_type: 'deposit',
      amount: 15000,
      processing_fee: 300,
      currency: 'aud',
      status: 'completed',
      stripe_payment_intent_id: 'pi_test_single',
      stripe_checkout_session_id: null,
      metadata: { note: 'First payment' },
      created_at: '2026-03-06T12:00:00Z',
      updated_at: '2026-03-06T12:00:00Z',
      job: { id: 'job-10', description: 'Electrical wiring', status: 'completed', trade_category: 'electrical' },
    };

    it('fetches a single payment by ID', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: mockPayment, error: null })
      );

      const result = await getPaymentById('pay-single');

      expect(supabase.from).toHaveBeenCalledWith('payments');
      expect(result).toEqual(mockPayment);
    });

    it('returns null when payment is not found', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: null, error: null })
      );

      const result = await getPaymentById('pay-nonexistent');

      expect(result).toBeNull();
    });

    it('throws on database error', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFromChain({ data: null, error: { message: 'permission denied for table payments' } })
      );

      await expect(getPaymentById('pay-denied')).rejects.toThrow(
        'permission denied for table payments'
      );
    });
  });
});
