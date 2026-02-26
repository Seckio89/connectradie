import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@14.21.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { status: 400, headers: corsHeaders });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, {
        status: 400,
        headers: corsHeaders,
      });
    }

    EdgeRuntime.waitUntil(handleEvent(event));

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleConnectAccountUpdate(account: Stripe.Account) {
  const userId = account.metadata?.user_id;
  if (!userId) {
    console.warn('No user_id in Connect account metadata:', account.id);
    return;
  }

  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const onboardingComplete = chargesEnabled && payoutsEnabled;

  const { error } = await supabase
    .from('profiles')
    .update({ stripe_connect_onboarding_complete: onboardingComplete })
    .eq('id', userId)
    .eq('stripe_connect_account_id', account.id);

  if (error) {
    console.error('Error updating Connect onboarding status:', error);
  } else {
    console.info(`Connect account ${account.id} for user ${userId}: onboarding_complete=${onboardingComplete}`);
  }
}

async function handleEvent(event: Stripe.Event) {
  if (event.type === 'account.updated') {
    await handleConnectAccountUpdate(event.data.object as Stripe.Account);
    return;
  }

  const stripeData = event?.data?.object ?? {};

  if (!stripeData) return;

  if (!('customer' in stripeData)) return;

  // Skip one-time payment intents (not invoice-linked)
  if (event.type === 'payment_intent.succeeded' && (event.data.object as any).invoice === null) {
    return;
  }

  const { customer: customerId } = stripeData as { customer: string };

  if (!customerId || typeof customerId !== 'string') {
    console.error(`No customer received on event: ${JSON.stringify(event)}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = stripeData as Stripe.Checkout.Session;

    if (session.mode === 'subscription') {
      console.info(`Processing subscription checkout for customer: ${customerId}`);

      // Save the customer ID to the profile using metadata user_id
      const userId = session.metadata?.user_id;
      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
          .is('stripe_customer_id', null);

        if (error) {
          console.error('Error saving stripe_customer_id to profile:', error);
        }
      }

      await syncCustomerFromStripe(customerId);
    } else if (session.mode === 'payment' && session.payment_status === 'paid') {
      try {
        const { error: orderError } = await supabase.from('stripe_orders').insert({
          checkout_session_id: session.id,
          payment_intent_id: session.payment_intent,
          customer_id: customerId,
          amount_subtotal: session.amount_subtotal,
          amount_total: session.amount_total,
          currency: session.currency,
          payment_status: session.payment_status,
          status: 'completed',
        });

        if (orderError) {
          console.error('Error inserting order:', orderError);
        }

        const processingFee = session.metadata?.processing_fee
          ? parseInt(session.metadata.processing_fee, 10)
          : 0;

        const { error: paymentUpdateError } = await supabase
          .from('payments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            processing_fee: processingFee,
            stripe_payment_intent_id: typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
          })
          .eq('stripe_checkout_session_id', session.id);

        if (paymentUpdateError) {
          console.error('Error updating payment record:', paymentUpdateError);
        } else {
          console.info(`Successfully processed one-time payment for session: ${session.id}`);
        }
      } catch (error) {
        console.error('Error processing one-time payment:', error);
      }
    }
  } else {
    // Handle subscription lifecycle events
    await syncCustomerFromStripe(customerId);
  }
}

async function syncCustomerFromStripe(customerId: string) {
  try {
    // Look up the profile by stripe_customer_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (profileError) {
      console.error('Error looking up profile by stripe_customer_id:', profileError);
    }

    const profileId = profile?.id;

    // Fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.info(`No subscriptions found for customer: ${customerId}`);

      if (profileId) {
        // Upsert with no active subscription
        await supabase
          .from('stripe_subscriptions')
          .upsert(
            {
              profile_id: profileId,
              stripe_customer_id: customerId,
              stripe_subscription_id: `none_${customerId}`,
              stripe_price_id: '',
              status: 'not_started',
            },
            { onConflict: 'stripe_customer_id' },
          );

        // Remove pro access
        await supabase
          .from('profiles')
          .update({ is_premium: false, subscription_expiry: null })
          .eq('id', profileId);
      }
      return;
    }

    const subscription = subscriptions.data[0];
    const isActive = ['active', 'trialing'].includes(subscription.status);
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    // Upsert subscription record
    if (profileId) {
      const { error: subError } = await supabase
        .from('stripe_subscriptions')
        .upsert(
          {
            profile_id: profileId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            stripe_price_id: subscription.items.data[0].price.id,
            current_period_start: subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000).toISOString()
              : null,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            status: subscription.status,
          },
          { onConflict: 'stripe_customer_id' },
        );

      if (subError) {
        console.error('Error syncing subscription to DB:', subError);
        throw new Error('Failed to sync subscription');
      }

      // Update profile pro access based on subscription status
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          is_premium: isActive,
          subscription_expiry: isActive ? periodEnd : null,
        })
        .eq('id', profileId);

      if (profileUpdateError) {
        console.error('Error updating profile premium status:', profileUpdateError);
        throw new Error('Failed to update profile premium status');
      }

      console.info(
        `Successfully synced subscription for customer: ${customerId}, profile: ${profileId}, active: ${isActive}`,
      );
    } else {
      console.warn(`No profile found for stripe_customer_id: ${customerId}. Skipping profile update.`);
    }
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}
