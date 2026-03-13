import { loadStripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import { trackEvent, GA_EVENTS } from './analytics';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const EDGE_FUNCTION_TIMEOUT = 30_000; // 30 seconds

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = EDGE_FUNCTION_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function createCheckoutSession(billingCycle: 'monthly' | 'annual' = 'monthly') {
  const monthlyPriceId = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
  const annualPriceId = import.meta.env.VITE_STRIPE_PRO_ANNUAL_PRICE_ID;

  const priceId = billingCycle === 'annual' ? (annualPriceId || monthlyPriceId) : monthlyPriceId;

  if (!priceId) {
    throw new Error('Stripe Price ID not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceId,
      idempotencyKey: generateIdempotencyKey(),
      successUrl: `${window.location.origin}/dashboard?subscription=success`,
      cancelUrl: `${window.location.origin}/dashboard?subscription=cancelled`,
    }),
  });

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || `Server error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error((data.error as string) || `Checkout failed (${response.status})`);
  }

  const { url } = data;

  if (!url) {
    throw new Error('No checkout URL received');
  }

  trackEvent(GA_EVENTS.BEGIN_CHECKOUT, { billing_cycle: billingCycle });
  window.location.href = url as string;
}

export async function createPaymentSession(paymentType: 'lead_unlock' | 'job_access', jobId: string) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/create-payment-session`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentType,
      jobId,
      idempotencyKey: generateIdempotencyKey(),
      successUrl: `${window.location.origin}/jobs?payment=success&type=${paymentType}&job_id=${jobId}`,
      cancelUrl: `${window.location.origin}/jobs?payment=cancelled`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create payment session');
  }

  const { url } = await response.json();

  if (!url) {
    throw new Error('No checkout URL received');
  }

  trackEvent(GA_EVENTS.BEGIN_CHECKOUT, { payment_type: paymentType, job_id: jobId });
  window.location.href = url;
}

export async function createConnectOnboardingSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/stripe-connect-onboarding`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refreshUrl: `${window.location.origin}/dashboard?connect=refresh`,
      returnUrl: `${window.location.origin}/dashboard?connect=success`,
    }),
  });

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || `Server error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error((data.error as string) || `Connect onboarding failed (${response.status})`);
  }

  const { url } = data;

  if (!url) {
    throw new Error('No onboarding URL received');
  }

  window.location.href = url as string;
}

export async function createIdentityVerification() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/stripe-identity-verification`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      returnUrl: `${window.location.origin}/settings?identity=success`,
    }),
  });

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || `Server error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error((data.error as string) || `Identity verification failed (${response.status})`);
  }

  const { url } = data;

  if (!url) {
    throw new Error('No verification URL received');
  }

  window.location.href = url as string;
}

export async function cancelSubscription(subscriptionId: string) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/cancel-subscription`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscriptionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel subscription');
  }

  return response.json();
}

export interface ConnectAccountDetails {
  connected: boolean;
  account?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: {
      currentlyDue: string[];
      pastDue: string[];
    };
  };
  balance?: {
    available: number;
    pending: number;
  };
  payouts?: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    arrival_date: number;
    created: number;
  }[];
  dashboardUrl?: string | null;
}

async function getValidAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // Check if token expires within 60 seconds — if so, refresh first
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 - Date.now() < 60_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) throw new Error('Session expired. Please log in again.');
    return refreshed.session.access_token;
  }

  return session.access_token;
}

export async function getConnectAccountDetails(): Promise<ConnectAccountDetails> {
  const token = await getValidAccessToken();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/stripe-connect-account`;

  const makeRequest = async (accessToken: string) => {
    return fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  };

  let response: Response;
  try {
    response = await makeRequest(token);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw new Error('Unable to reach the payout service. The stripe-connect-account function may not be deployed.');
  }

  // If 401, refresh token and retry once
  if (response.status === 401) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) {
      throw new Error('Session expired. Please log in again.');
    }
    try {
      response = await makeRequest(refreshed.session.access_token);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw err;
    }
  }

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || `Server error (${response.status})`);
  }

  if (!response.ok) {
    throw new Error((data.error as string) || `Failed to fetch account details (${response.status})`);
  }

  return data as unknown as ConnectAccountDetails;
}

export { stripePromise };
