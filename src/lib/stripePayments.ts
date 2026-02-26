import { supabase } from './supabase';
import { callEdgeFunction } from './edgeFn';

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

/** Platform fee rate for free-tier tradies (10%). */
export const PLATFORM_FEE_RATE_FREE = 0.10;

/** Platform fee rate for pro-tier tradies (0%). */
export const PLATFORM_FEE_RATE_PRO = 0;

/** ConnecTradie processing fee (2%). */
export const PROCESSING_FEE_RATE = 0.02;

/** Stripe processing fee: 1.75% + 30c per transaction (domestic AU cards). */
export const STRIPE_FEE_RATE = 0.0175;
export const STRIPE_FEE_FIXED_CENTS = 30;

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
 * Create a Stripe Checkout session for a job deposit.
 * Redirects the browser to the Stripe-hosted payment page on success.
 */
export async function createJobDeposit(
  jobId: string,
  amountCents: number,
): Promise<{ url: string }> {
  const result = await callEdgeFunction<{ url: string }>('create-job-deposit', {
    jobId,
    amountCents,
    successUrl: `${window.location.origin}/jobs/${jobId}?payment=success`,
    cancelUrl: `${window.location.origin}/jobs/${jobId}?payment=cancelled`,
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
  const result = await callEdgeFunction<{ url: string }>('pay-milestone', {
    milestoneId,
    successUrl: `${window.location.origin}/milestones/${milestoneId}?payment=success`,
    cancelUrl: `${window.location.origin}/milestones/${milestoneId}?payment=cancelled`,
  });

  if (!result.url) {
    throw new Error('No checkout URL received from pay-milestone');
  }

  return result;
}

/**
 * Release escrowed funds for a completed payment.
 */
export async function releaseEscrow(
  paymentId: string,
): Promise<{ success: boolean }> {
  return callEdgeFunction<{ success: boolean }>('release-escrow', { paymentId });
}

/**
 * Process a refund for a payment.
 */
export async function processRefund(
  paymentId: string,
  reason?: string,
): Promise<{ success: boolean; refundId?: string }> {
  return callEdgeFunction<{ success: boolean; refundId?: string }>('process-refund', {
    paymentId,
    reason: reason ?? null,
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
