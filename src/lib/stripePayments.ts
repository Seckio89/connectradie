import { supabase } from './supabase';
import { callEdgeFunction } from './edgeFn';
import { PRICING_CONFIG } from '../config/pricing';

// ---------------------------------------------------------------------------
// Idempotency key helper – prevents duplicate payment submissions
// ---------------------------------------------------------------------------

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeBreakdown {
  baseCents: number;
  processingFee: number;
  platformFee: number;
  stripeFee: number;
  totalCharge: number;
  tradiePayout: number;
}

export interface PaymentRecord {
  id: string;
  profile_id: string;
  job_id: string;
  payment_type: string;
  amount: number;
  processing_fee: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistoryItem extends PaymentRecord {
  job?: {
    id: string;
    description: string;
    status: string;
    trade_category: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Fee constants (AUD, amounts in cents)
// ---------------------------------------------------------------------------

/** Platform fee rate for free-tier tradies — first sliding-scale tier (10%). */
export const PLATFORM_FEE_RATE_FREE = PRICING_CONFIG.tradie.free.platformFee.tiers[0].rate;

/** Platform fee rate for pro-tier tradies — first sliding-scale tier (5%). */
export const PLATFORM_FEE_RATE_PRO = PRICING_CONFIG.tradie.pro.platformFee.tiers[0].rate;

/** ConnecTradie processing fee (Stripe + platform margin). Derived from PRICING_CONFIG. */
export const PROCESSING_FEE_RATE =
  PRICING_CONFIG.processing.stripePercentage +
  PRICING_CONFIG.processing.platformProcessingMargin;

/** Stripe processing fee: 1.75% + 30c per transaction (domestic AU cards). */
export const STRIPE_FEE_RATE = PRICING_CONFIG.processing.stripePercentage;
export const STRIPE_FEE_FIXED_CENTS = PRICING_CONFIG.processing.stripeFixed * 100;

// ---------------------------------------------------------------------------
// Fee calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the full fee breakdown for a payment amount.
 *
 * @param amountCents  The base job amount in cents (AUD).
 * @param isPro        Whether the tradie is on the Pro subscription.
 * @returns            A complete {@link FeeBreakdown}.
 */
export function calculateFees(amountCents: number, isPro: boolean): FeeBreakdown {
  const baseCents = Math.round(amountCents);
  const processingFee = Math.round(baseCents * PROCESSING_FEE_RATE);
  const platformFeeRate = isPro ? PLATFORM_FEE_RATE_PRO : PLATFORM_FEE_RATE_FREE;
  const platformFee = Math.round(baseCents * platformFeeRate);
  const stripeFee = Math.round(baseCents * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTS;
  const totalCharge = baseCents + processingFee + stripeFee;
  const tradiePayout = baseCents - platformFee;

  return {
    baseCents,
    processingFee,
    platformFee,
    stripeFee,
    totalCharge,
    tradiePayout,
  };
}

// ---------------------------------------------------------------------------
// Edge-function helpers
// ---------------------------------------------------------------------------

/**
 * Accept a quote and create a Stripe Checkout session in one step.
 * The edge function accepts the quote, assigns the tradie, and creates the payment.
 * Redirects the browser to the Stripe-hosted payment page on success.
 */
export async function acceptAndPay(
  quoteId: string,
  jobId: string,
  agreedPrice?: number,
): Promise<{ url: string; paymentId: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string; paymentId: string }>('accept-and-pay', {
    quoteId,
    idempotencyKey,
    agreedPrice,
    successUrl: `${window.location.origin}/leads?payment=success&job_id=${jobId}`,
    cancelUrl: `${window.location.origin}/leads?payment=cancelled&job_id=${jobId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from accept-and-pay');
  }

  return result;
}

/**
 * Create a Stripe Checkout session for a job deposit.
 * Redirects the browser to the Stripe-hosted payment page on success.
 */
export async function createJobDeposit(
  jobId: string,
  amountCents: number,
): Promise<{ url: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string }>('create-job-deposit', {
    jobId,
    amountCents,
    idempotencyKey,
    successUrl: `${window.location.origin}/jobs?payment=success&job_id=${jobId}`,
    cancelUrl: `${window.location.origin}/jobs?payment=cancelled&job_id=${jobId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from create-job-deposit');
  }

  return result;
}

/**
 * Pay a specific job milestone via Stripe Checkout.
 */
export async function payMilestone(
  milestoneId: string,
): Promise<{ url: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string }>('pay-milestone', {
    milestoneId,
    idempotencyKey,
    successUrl: `${window.location.origin}/jobs?payment=success&milestone_id=${milestoneId}`,
    cancelUrl: `${window.location.origin}/jobs?payment=cancelled&milestone_id=${milestoneId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from pay-milestone');
  }

  return result;
}

/**
 * Create a Stripe Checkout session for an existing pending payment record.
 * Redirects the browser to the Stripe-hosted payment page on success.
 */
export async function createJobPaymentCheckout(
  paymentId: string,
): Promise<{ url: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string }>('create-job-payment-checkout', {
    paymentId,
    idempotencyKey,
    successUrl: `${window.location.origin}/payments?payment=success&payment_id=${paymentId}`,
    cancelUrl: `${window.location.origin}/payments?payment=cancelled&payment_id=${paymentId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received');
  }

  return result;
}

/**
 * Verify a payment's status by checking the Stripe session directly.
 * This is a fallback for when the Stripe webhook fails to update the payment record.
 */
export async function verifyPayment(
  paymentId: string,
): Promise<{ status: string; message: string; verified_via?: string }> {
  return callEdgeFunction<{ status: string; message: string; verified_via?: string }>('verify-payment', { paymentId });
}

/**
 * Release escrowed funds for a completed payment.
 */
export async function releaseEscrow(
  paymentId: string,
): Promise<{ success: boolean }> {
  const idempotencyKey = generateIdempotencyKey();
  return callEdgeFunction<{ success: boolean }>('release-escrow', { paymentId, idempotencyKey });
}

/**
 * Translate raw payment-flow errors into a clean user-facing message.
 * Strips Stripe internal URLs, dev-test-card numbers, and code-y language so
 * users never see something like "use the 4000000000000077 test card".
 */
export function humanizePaymentError(message: string | undefined | null): string {
  const fallback = "We couldn't process that right now. Please try again — if it keeps failing, contact support.";
  if (!message) return fallback;
  const lower = message.toLowerCase();
  if (lower.includes('insufficient') && lower.includes('fund')) {
    return "Payment couldn't be released due to a temporary platform balance issue. Please try again shortly — if it keeps failing, contact support.";
  }
  if (lower.includes('stripe.com') || lower.includes('test card') || /\b4\d{15}\b/.test(message)) {
    return fallback;
  }
  if (lower.includes('account_invalid') || lower.includes('account_inactive')) {
    return "The tradie's payout account isn't fully set up. Ask them to complete Stripe onboarding before you release the payment.";
  }
  return message;
}

/**
 * Set a final price on a quote after a site inspection.
 * Handles partial refund (decrease) or pending increase request (increase).
 */
export async function adjustQuotePrice(
  quoteId: string,
  finalPrice: number,
): Promise<{ action: string; finalPrice: number; refundAmount?: number; additionalAmount?: number }> {
  return callEdgeFunction<{ action: string; finalPrice: number; refundAmount?: number; additionalAmount?: number }>(
    'adjust-quote-price',
    { quoteId, finalPrice },
  );
}

/**
 * Pay the additional amount for a price increase after site inspection.
 * Creates a Stripe Checkout session for the difference.
 */
export async function payPriceIncrease(
  paymentId: string,
  jobId: string,
): Promise<{ url: string; paymentId: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string; paymentId: string }>('pay-price-increase', {
    paymentId,
    idempotencyKey,
    successUrl: `${window.location.origin}/leads?payment=success&job_id=${jobId}`,
    cancelUrl: `${window.location.origin}/leads?payment=cancelled&job_id=${jobId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from pay-price-increase');
  }

  return result;
}

/**
 * Client: send a bonus (tip) to the tradie after the job is paid and released.
 * Creates a Stripe Checkout session that routes funds directly to the tradie's Connect account.
 */
export async function createBonusPayment(
  originalPaymentId: string,
  bonusAmount: number,
  jobId: string,
): Promise<{ url: string; paymentId: string }> {
  const idempotencyKey = generateIdempotencyKey();
  const result = await callEdgeFunction<{ url: string; paymentId: string }>('create-bonus-payment', {
    originalPaymentId,
    bonusAmount,
    idempotencyKey,
    successUrl: `${window.location.origin}/payments?bonus=success&job_id=${jobId}`,
    cancelUrl: `${window.location.origin}/dashboard?bonus=cancelled&job_id=${jobId}`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from create-bonus-payment');
  }

  return result;
}

/**
 * Client: request a reduction on an already-paid payment (e.g. overpaid by mistake).
 * Writes a pending_reduction onto payment.metadata and notifies the tradie.
 */
export async function requestPriceReduction(
  paymentId: string,
  newTotal: number,
  reason?: string,
): Promise<{ success: boolean; proposedAmount: number; refundAmount: number }> {
  return callEdgeFunction<{ success: boolean; proposedAmount: number; refundAmount: number }>(
    'client-request-reduction',
    { paymentId, newTotal, reason: reason ?? null },
  );
}

/**
 * Tradie: approve or decline a client-requested price reduction.
 * Approve → issues partial Stripe refund and updates the payment amount.
 * Decline → clears the pending_reduction from metadata.
 */
export async function approvePriceReduction(
  paymentId: string,
  approve: boolean,
): Promise<{ action: 'approved' | 'declined'; refundId?: string; refundAmount?: number; newTotal?: number }> {
  return callEdgeFunction<{ action: 'approved' | 'declined'; refundId?: string; refundAmount?: number; newTotal?: number }>(
    'approve-price-reduction',
    { paymentId, approve },
  );
}

/**
 * Process a refund for a payment.
 */
export async function processRefund(
  paymentId: string,
  reason?: string,
): Promise<{ success: boolean; refundId?: string }> {
  const idempotencyKey = generateIdempotencyKey();
  return callEdgeFunction<{ success: boolean; refundId?: string }>('process-refund', {
    paymentId,
    reason: reason ?? null,
    idempotencyKey,
  });
}

// ---------------------------------------------------------------------------
// Payment queries
// ---------------------------------------------------------------------------

/**
 * Fetch payment history for the current user (or a specific user).
 * Includes joined job details.
 */
export async function getPaymentHistory(
  userId?: string,
): Promise<PaymentHistoryItem[]> {
  let profileId = userId;

  if (!profileId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    profileId = user.id;
  }

  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      job:jobs(id, description, status, trade_category)
    `)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data as unknown as PaymentHistoryItem[]) ?? [];
}

/**
 * Fetch a single payment record with its associated job details.
 */
export async function getPaymentById(
  paymentId: string,
): Promise<PaymentHistoryItem | null> {
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      job:jobs(id, description, status, trade_category)
    `)
    .eq('id', paymentId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data as unknown as PaymentHistoryItem | null;
}
