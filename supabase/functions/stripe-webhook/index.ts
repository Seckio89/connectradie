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
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://connectradie.com.au',
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
      console.error('Webhook: No stripe-signature header found');
      return new Response(JSON.stringify({ error: 'No signature found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!stripeWebhookSecret) {
      console.error('Webhook: STRIPE_WEBHOOK_SECRET env var is not set');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      console.error(`Webhook secret starts with: ${stripeWebhookSecret?.slice(0, 10)}...`);
      console.error(`Webhook secret length: ${stripeWebhookSecret?.length}`);
      console.error(`Signature starts with: ${signature?.slice(0, 20)}...`);
      console.error(`Body length: ${body?.length}`);
      return new Response(JSON.stringify({ error: `Signature verification failed: ${error.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.info(`Webhook received: ${event.type} (${event.id})`);

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

async function handleIdentityVerification(session: any) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.warn('No user_id in identity session metadata:', session.id);
    return;
  }

  if (session.status === 'verified') {
    const { error } = await supabase
      .from('profiles')
      .update({ is_identity_verified: true })
      .eq('id', userId);

    if (error) {
      console.error('Error updating identity verification status:', error);
    } else {
      console.info(`Identity verified for user ${userId} (session ${session.id})`);
    }
  } else if (session.status === 'requires_input') {
    // Verification failed or needs retry — clear session so user can start fresh
    const { error } = await supabase
      .from('profiles')
      .update({ stripe_identity_session_id: null, is_identity_verified: false })
      .eq('id', userId);

    if (error) {
      console.error('Error clearing identity session:', error);
    } else {
      console.info(`Identity verification requires retry for user ${userId} (session ${session.id})`);
    }
  }
}

async function handleEvent(event: Stripe.Event) {
  if (event.type === 'account.updated') {
    await handleConnectAccountUpdate(event.data.object as Stripe.Account);
    return;
  }

  // Stripe Identity events
  if (event.type === 'identity.verification_session.verified' ||
      event.type === 'identity.verification_session.requires_input') {
    await handleIdentityVerification(event.data.object);
    return;
  }

  // Handle setup_intent.succeeded — BECS Direct Debit mandate saved
  if (event.type === 'setup_intent.succeeded') {
    const setupIntent = event.data.object as Stripe.SetupIntent;
    const meta = setupIntent.metadata || {};
    const recurringJobId = meta.recurring_job_id;
    const clientId = meta.client_id;
    const tradieId = meta.tradie_id;

    if (recurringJobId && clientId && setupIntent.payment_method) {
      try {
        const pmId = typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method.id;

        const pm = await stripe.paymentMethods.retrieve(pmId);
        const becsDetails = pm.au_becs_debit;

        await supabase.from('saved_payment_methods').upsert({
          client_id: clientId,
          tradie_id: tradieId || null,
          recurring_job_id: recurringJobId,
          stripe_customer_id: typeof setupIntent.customer === 'string'
            ? setupIntent.customer : (setupIntent.customer as Stripe.Customer)?.id || '',
          stripe_payment_method_id: pmId,
          payment_method_type: 'au_becs_debit',
          bsb_last4: becsDetails?.bsb_number?.slice(-4) || null,
          account_last4: becsDetails?.last4 || null,
          bank_name: null,
          mandate_status: 'active',
          stripe_mandate_id: typeof setupIntent.mandate === 'string'
            ? setupIntent.mandate : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'recurring_job_id' });

        await supabase
          .from('recurring_jobs')
          .update({ preferred_payment_method: 'au_becs_debit' })
          .eq('id', recurringJobId);

        // Notify client
        await supabase.from('notifications').insert({
          user_id: clientId,
          type: 'becs_setup_complete',
          title: 'Direct Debit Set Up',
          message: `Your bank account (****${becsDetails?.last4 || '****'}) has been linked for automatic payments on your recurring service.`,
          metadata: { recurring_job_id: recurringJobId },
          read: false,
        });

        // Notify tradie
        if (tradieId) {
          await supabase.from('notifications').insert({
            user_id: tradieId,
            type: 'becs_setup_complete',
            title: 'Client Set Up Direct Debit',
            message: 'Your client has set up direct debit for automatic invoice payments.',
            metadata: { recurring_job_id: recurringJobId },
            read: false,
          });
        }

        console.info(`BECS setup complete for recurring_job ${recurringJobId}, client ${clientId}`);
      } catch (err) {
        console.error('Failed to process setup_intent.succeeded:', err);
      }
    }
    return;
  }

  // Handle setup_intent.setup_failed — BECS setup failed
  if (event.type === 'setup_intent.setup_failed') {
    const setupIntent = event.data.object as Stripe.SetupIntent;
    const clientId = setupIntent.metadata?.client_id;

    if (clientId) {
      await supabase.from('notifications').insert({
        user_id: clientId,
        type: 'becs_setup_failed',
        title: 'Direct Debit Setup Failed',
        message: 'We could not verify your bank account. Please try again or use a different account.',
        read: false,
      });
      console.info(`BECS setup failed for client ${clientId}`);
    }
    return;
  }

  // Handle mandate.updated — BECS mandate revoked by bank or client
  if (event.type === 'mandate.updated') {
    const mandate = event.data.object as Stripe.Mandate;
    if (mandate.status === 'inactive' || mandate.status === 'revoked' || (mandate as Record<string, unknown>).status === 'revoked') {
      const mandateId = mandate.id;

      const { data: saved } = await supabase
        .from('saved_payment_methods')
        .select('id, client_id, recurring_job_id')
        .eq('stripe_mandate_id', mandateId)
        .maybeSingle();

      if (saved) {
        await supabase
          .from('saved_payment_methods')
          .update({ mandate_status: 'revoked', updated_at: new Date().toISOString() })
          .eq('id', saved.id);

        await supabase
          .from('recurring_jobs')
          .update({ preferred_payment_method: 'card' })
          .eq('id', saved.recurring_job_id);

        await supabase.from('notifications').insert({
          user_id: saved.client_id,
          type: 'becs_mandate_revoked',
          title: 'Direct Debit Cancelled',
          message: 'Your direct debit authorisation has been revoked. Future invoices will require manual card payment.',
          metadata: { recurring_job_id: saved.recurring_job_id },
          read: false,
        });

        console.info(`BECS mandate ${mandateId} revoked for recurring_job ${saved.recurring_job_id}`);
      }
    }
    return;
  }

  // Handle invoice.payment_failed — subscription payment failure
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
    if (customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (profile) {
        // Update subscription status
        await supabase
          .from('stripe_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', customerId);

        // Notify user
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'PAYMENT_FAILED',
          title: 'Subscription Payment Failed',
          message: 'Your subscription payment could not be processed. Please update your payment method to avoid service interruption.',
        });

        console.info(`Invoice payment failed for customer ${customerId}, user ${profile.id}`);
      }
    }
    return;
  }

  // Handle charge.dispute.created — dispute notification to admin
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge as any)?.id;
    const amount = dispute.amount;
    const reason = dispute.reason;

    // Cannot insert a dispute record without job/user context from Stripe dispute alone
    // Log for admin review and rely on the admin notification below
    console.warn(`Stripe dispute ${dispute.id} received but cannot create DB record without job context. Charge: ${chargeId}, Amount: ${amount}, Reason: ${reason}`);

    // Notify all admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      const adminNotifications = admins.map((admin) => ({
        user_id: admin.id,
        type: 'DISPUTE_CREATED',
        title: 'New Payment Dispute',
        message: `A payment dispute has been created (${dispute.id}). Amount: $${(amount / 100).toFixed(2)} ${dispute.currency?.toUpperCase()}. Reason: ${reason}.`,
      }));

      await supabase.from('notifications').insert(adminNotifications);
    }

    console.info(`Dispute created: ${dispute.id}, amount: ${amount}, reason: ${reason}`);
    return;
  }

  // Handle payment_intent.payment_failed — one-time payment failure notification
  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // BECS recurring invoice failure — create card fallback
    if (paymentIntent.metadata?.type === 'recurring_invoice_becs') {
      const invoiceId = paymentIntent.metadata.invoice_id;
      const recurringJobId = paymentIntent.metadata.recurring_job_id;
      const homeownerId = paymentIntent.metadata.homeowner_id;

      if (invoiceId) {
        try {
          // Mark BECS as failed
          await supabase
            .from('recurring_invoices')
            .update({
              becs_charge_status: 'failed',
              becs_failed_at: new Date().toISOString(),
            })
            .eq('id', invoiceId);

          // Fetch invoice to create card fallback checkout
          const { data: invoice } = await supabase
            .from('recurring_invoices')
            .select('total, homeowner_id, tradie_id, recurring_job_id, billing_period_start, billing_period_end')
            .eq('id', invoiceId)
            .maybeSingle();

          if (invoice) {
            const siteUrl = Deno.env.get('SITE_URL') || 'https://connectradie.com.au';
            const totalCents = Math.round(Number(invoice.total) * 100);

            const checkoutSession = await stripe.checkout.sessions.create({
              mode: 'payment',
              payment_method_types: ['card'],
              line_items: [{ price_data: { currency: 'aud', unit_amount: totalCents, product_data: { name: 'Recurring Service Invoice (Card Fallback)' } }, quantity: 1 }],
              metadata: {
                type: 'recurring_invoice',
                recurring_job_id: recurringJobId,
                invoice_id: invoiceId,
                homeowner_id: invoice.homeowner_id,
                tradie_id: invoice.tradie_id,
              },
              success_url: `${siteUrl}/payments?invoice_paid=true`,
              cancel_url: `${siteUrl}/payments?invoice_cancelled=true`,
            });

            await supabase
              .from('recurring_invoices')
              .update({
                status: 'sent',
                payment_method: 'card',
                stripe_checkout_session_id: checkoutSession.id,
                stripe_payment_url: checkoutSession.url,
              })
              .eq('id', invoiceId);
          }

          // Notify client
          if (homeownerId) {
            await supabase.from('notifications').insert({
              user_id: homeownerId,
              type: 'becs_payment_failed',
              title: 'Direct Debit Unsuccessful',
              message: 'Your direct debit payment could not be processed. Please pay by card using the link in your invoice.',
              metadata: { recurring_job_id: recurringJobId, invoice_id: invoiceId },
              read: false,
            });
          }

          console.info(`BECS payment failed for invoice ${invoiceId}, card fallback created`);
        } catch (err) {
          console.error('Failed to handle BECS payment failure fallback:', err);
        }
      }
      return;
    }

    // Generic payment failure
    const userId = paymentIntent.metadata?.user_id;
    const failureMessage = paymentIntent.last_payment_error?.message || 'Unknown error';

    if (userId) {
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'PAYMENT_FAILED',
        title: 'Payment Failed',
        message: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} could not be processed: ${failureMessage}. Please try again.`,
      });

      console.info(`Payment intent failed for user ${userId}: ${failureMessage}`);
    }
    return;
  }

  // Handle payment_intent.succeeded — BECS recurring invoice payment confirmation
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;

    if (pi.metadata?.type === 'recurring_invoice_becs') {
      const invoiceId = pi.metadata.invoice_id;
      const recurringJobId = pi.metadata.recurring_job_id;
      const tradieId = pi.metadata.tradie_id;
      const platformFeeCents = pi.metadata.platform_fee ? parseInt(pi.metadata.platform_fee, 10) : 0;
      const processingFeeCents = pi.metadata.processing_fee ? parseInt(pi.metadata.processing_fee, 10) : 0;

      if (invoiceId) {
        try {
          // Mark invoice as paid
          await supabase
            .from('recurring_invoices')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              becs_charge_status: 'succeeded',
              stripe_payment_intent_id: pi.id,
            })
            .eq('id', invoiceId);

          // Transfer to tradie via Connect
          if (tradieId) {
            const { data: tradieProfile } = await supabase
              .from('profiles')
              .select('stripe_connect_account_id, stripe_connect_onboarding_complete')
              .eq('id', tradieId)
              .maybeSingle();

            if (tradieProfile?.stripe_connect_account_id && tradieProfile.stripe_connect_onboarding_complete) {
              const baseAmount = pi.amount - processingFeeCents;
              const transferAmount = baseAmount - platformFeeCents;

              if (transferAmount > 0) {
                const transfer = await stripe.transfers.create({
                  amount: transferAmount,
                  currency: 'aud',
                  destination: tradieProfile.stripe_connect_account_id,
                  transfer_group: `recurring_${recurringJobId}`,
                  metadata: {
                    type: 'recurring_invoice_payout',
                    recurring_job_id: recurringJobId,
                    tradie_id: tradieId,
                    platform_fee: String(platformFeeCents),
                    payment_method: 'au_becs_debit',
                  },
                });
                console.info(`BECS invoice transfer ${transfer.id} of ${transferAmount} cents to tradie ${tradieId}`);
              }
            }

            // Notify tradie
            const amountDollars = (pi.amount / 100).toFixed(2);
            await supabase.from('notifications').insert({
              user_id: tradieId,
              title: 'Invoice Paid (Direct Debit)',
              message: `Your recurring service invoice of $${amountDollars} has been paid via direct debit. Funds are being transferred to your account.`,
              type: 'payment_received',
              read: false,
              metadata: { recurring_job_id: recurringJobId, invoice_id: invoiceId },
            });
          }

          console.info(`BECS payment succeeded for invoice ${invoiceId}`);
        } catch (err) {
          console.error('Failed to process BECS payment_intent.succeeded:', err);
        }
      }
      return;
    }
  }

  const stripeData = event?.data?.object ?? {};

  if (!stripeData) return;

  // Handle checkout.session.completed for one-time payments (may not have customer)
  if (event.type === 'checkout.session.completed') {
    const session = stripeData as Stripe.Checkout.Session;

    if (session.mode === 'payment' && session.payment_status === 'paid') {
      console.info(`Processing one-time payment checkout: session=${session.id}, payment_record=${session.metadata?.payment_record_id}`);
      try {
        // Insert order record
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        if (customerId) {
          await supabase.from('stripe_orders').insert({
            checkout_session_id: session.id,
            payment_intent_id: session.payment_intent,
            customer_id: customerId,
            amount_subtotal: session.amount_subtotal,
            amount_total: session.amount_total,
            currency: session.currency,
            payment_status: session.payment_status,
            status: 'completed',
          }).then(({ error }) => {
            if (error) console.error('Error inserting order:', error);
          });
        }

        const processingFee = session.metadata?.processing_fee
          ? parseInt(session.metadata.processing_fee, 10)
          : 0;

        const { data: updated, error: paymentUpdateError } = await supabase
          .from('payments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            processing_fee: processingFee,
            stripe_payment_intent_id: typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
          })
          .eq('stripe_checkout_session_id', session.id)
          .select('id');

        if (paymentUpdateError) {
          console.error('Error updating payment record:', paymentUpdateError);
        } else {
          console.info(`Payment record updated for session ${session.id}: ${JSON.stringify(updated)}`);

          // --- Send payment confirmed emails to homeowner and tradie ---
          try {
            const amountDollars = ((session.amount_total ?? 0) / 100).toFixed(2);
            const homeownerId = session.metadata?.user_id;
            const jobId = session.metadata?.job_id;

            // Look up payment record for tradie_id and homeowner email
            if (homeownerId) {
              const { data: homeowner } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', homeownerId)
                .maybeSingle();

              // Notify homeowner (in-app + email)
              await supabase.from('notifications').insert({
                user_id: homeownerId,
                title: 'Payment Confirmed',
                message: `Your payment of $${amountDollars} has been confirmed. Funds are held securely in escrow.`,
                type: 'payment_received',
                read: false,
                metadata: { job_id: jobId, amount: amountDollars },
              });

              if (homeowner?.email) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({
                    to: homeowner.email,
                    subject: `Payment of $${amountDollars} Confirmed`,
                    body: `Hi ${homeowner.full_name || 'there'},\n\nYour payment of $${amountDollars} has been confirmed. Funds are held securely in escrow until you approve the completed work.\n\nView your job in the ConnecTradie dashboard.`,
                    notificationType: 'PAYMENT_RECEIVED',
                    metadata: { amount: `$${amountDollars}`, job_id: jobId },
                  }),
                }).catch((e) => console.error('Failed to send homeowner payment email:', e));
              }

              // Notify tradie (in-app + email) — look up tradie from job
              if (jobId) {
                const { data: job } = await supabase
                  .from('jobs')
                  .select('tradie_id')
                  .eq('id', jobId)
                  .maybeSingle();

                if (job?.tradie_id) {
                  const { data: tradie } = await supabase
                    .from('profiles')
                    .select('email, full_name')
                    .eq('id', job.tradie_id)
                    .maybeSingle();

                  await supabase.from('notifications').insert({
                    user_id: job.tradie_id,
                    title: 'Payment Confirmed',
                    message: `A payment of $${amountDollars} has been confirmed — funds are on the way once the job is approved.`,
                    type: 'payment_received',
                    read: false,
                    metadata: { job_id: jobId, amount: amountDollars },
                  });

                  if (tradie?.email) {
                    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${serviceKey}`,
                      },
                      body: JSON.stringify({
                        to: tradie.email,
                        subject: `Payment of $${amountDollars} Confirmed — Funds on the Way`,
                        body: `Hi ${tradie.full_name || 'there'},\n\nA payment of $${amountDollars} has been confirmed for your job. Funds will be released to your account once the homeowner approves the completed work.\n\nKeep up the great work!`,
                        notificationType: 'PAYMENT_RECEIVED',
                        metadata: { amount: `$${amountDollars}`, job_id: jobId },
                      }),
                    }).catch((e) => console.error('Failed to send tradie payment email:', e));
                  }
                }
              }
            }
          } catch (emailErr) {
            console.error('Payment confirmation email error (non-fatal):', emailErr);
          }

          // If this is a recurring_invoice payment, mark the invoice as paid and transfer to tradie
          if (session.metadata?.type === 'recurring_invoice') {
            // Match by checkout session ID (payment_intent is null at session creation time)
            const { error: invoiceUpdateError } = await supabase
              .from('recurring_invoices')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
              })
              .eq('stripe_checkout_session_id', session.id);

            if (invoiceUpdateError) {
              console.error('Error updating recurring invoice to paid:', invoiceUpdateError);
            } else {
              console.info(`Recurring invoice marked as paid (checkout_session: ${session.id})`);
            }

            // Transfer funds to tradie (minus platform fee)
            const tradieId = session.metadata?.tradie_id;
            const platformFeeCents = session.metadata?.platform_fee
              ? parseInt(session.metadata.platform_fee, 10)
              : 0;

            if (tradieId) {
              try {
                // Get the tradie's Connect account
                const { data: tradieProfile } = await supabase
                  .from('profiles')
                  .select('stripe_connect_account_id, stripe_connect_onboarding_complete')
                  .eq('id', tradieId)
                  .maybeSingle();

                if (tradieProfile?.stripe_connect_account_id && tradieProfile?.stripe_connect_onboarding_complete) {
                  // Calculate transfer: total paid minus processing fee (kept by Stripe) minus platform fee (kept by us)
                  // session.amount_total includes the processing fee line item
                  // We need the base service amount minus our platform fee
                  const processingFeeMeta = session.metadata?.processing_fee
                    ? parseInt(session.metadata.processing_fee, 10)
                    : 0;
                  const baseServiceAmount = (session.amount_total ?? 0) - processingFeeMeta;
                  const transferAmount = baseServiceAmount - platformFeeCents;

                  if (transferAmount > 0) {
                    const transfer = await stripe.transfers.create({
                      amount: transferAmount,
                      currency: 'aud',
                      destination: tradieProfile.stripe_connect_account_id,
                      transfer_group: `recurring_${session.metadata?.recurring_job_id}`,
                      metadata: {
                        type: 'recurring_invoice_payout',
                        recurring_job_id: session.metadata?.recurring_job_id ?? '',
                        tradie_id: tradieId,
                        platform_fee: String(platformFeeCents),
                      },
                    });
                    console.info(`Recurring invoice transfer ${transfer.id} of ${transferAmount} cents to tradie ${tradieId} (platform fee: ${platformFeeCents} cents)`);
                  }
                } else {
                  console.warn(`Tradie ${tradieId} has no Connect account — recurring invoice payout skipped`);
                }
              } catch (transferErr) {
                console.error('Error transferring recurring invoice payout to tradie:', transferErr);
              }

              // Notify the tradie
              const amountDollars = ((session.amount_total ?? 0) / 100).toFixed(2);
              await supabase.from('notifications').insert({
                user_id: tradieId,
                title: 'Invoice Paid',
                message: `Your recurring service invoice of $${amountDollars} has been paid. Funds are being transferred to your account.`,
                type: 'payment_received',
                read: false,
              });
            }
          }

          // If this is a job_funding payment, update job status to 'funded' (escrow held)
          // Lifecycle: pending → accepted → funded → in_progress → completed
          if (session.metadata?.payment_type === 'job_funding' && session.metadata?.job_id) {
            const { error: jobUpdateError } = await supabase
              .from('jobs')
              .update({ status: 'funded' })
              .eq('id', session.metadata.job_id)
              .in('status', ['pending', 'accepted']);

            if (jobUpdateError) {
              console.error('Error updating job status to funded:', jobUpdateError);
            } else {
              console.info(`Job ${session.metadata.job_id} status updated to funded`);
            }
          }

          // If this is a price_adjustment payment (additional charge after site visit),
          // clear the pending_increase from the parent payment and update job budget
          if (session.metadata?.payment_type === 'price_adjustment' && session.metadata?.parent_payment_id) {
            try {
              const parentId = session.metadata.parent_payment_id;

              const { data: parentPayment } = await supabase
                .from('payments')
                .select('metadata')
                .eq('id', parentId)
                .maybeSingle();

              if (parentPayment) {
                const meta = { ...(parentPayment.metadata || {}) };
                delete meta.pending_increase;
                meta.increase_completed = true;
                meta.increase_completed_at = new Date().toISOString();

                await supabase
                  .from('payments')
                  .update({ metadata: meta })
                  .eq('id', parentId);

                console.info(`Cleared pending_increase from parent payment ${parentId}`);
              }

              // Update job budget_amount to the final price from the quote
              if (session.metadata?.job_id) {
                const { data: acceptedQuote } = await supabase
                  .from('quotes')
                  .select('final_price')
                  .eq('job_id', session.metadata.job_id)
                  .eq('status', 'accepted')
                  .maybeSingle();

                if (acceptedQuote?.final_price) {
                  await supabase
                    .from('jobs')
                    .update({ budget_amount: acceptedQuote.final_price })
                    .eq('id', session.metadata.job_id);

                  console.info(`Updated job ${session.metadata.job_id} budget to ${acceptedQuote.final_price}`);
                }
              }
            } catch (adjErr) {
              console.error('Error handling price_adjustment completion:', adjErr);
            }
          }
        }
      } catch (error) {
        console.error('Error processing one-time payment:', error);
      }
      return;
    }

    // Subscription checkout — needs customer
    if (session.mode === 'subscription') {
      const subCustomerId = typeof session.customer === 'string' ? session.customer : null;
      if (!subCustomerId) {
        console.error('Subscription checkout missing customer ID');
        return;
      }
      console.info(`Processing subscription checkout for customer: ${subCustomerId}`);

      const userId = session.metadata?.user_id;
      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update({ stripe_customer_id: subCustomerId })
          .eq('id', userId)
          .is('stripe_customer_id', null);

        if (error) {
          console.error('Error saving stripe_customer_id to profile:', error);
        }
      }

      await syncCustomerFromStripe(subCustomerId);
    }
    return;
  }

  // For all other events that have a customer (subscription lifecycle, etc.)
  if (!('customer' in stripeData)) return;

  const { customer: customerId } = stripeData as { customer: string };

  if (!customerId || typeof customerId !== 'string') {
    console.error(`No customer received on event ${event.type}`);
    return;
  }

  // Skip one-time payment intents (not invoice-linked)
  if (event.type === 'payment_intent.succeeded' && (event.data.object as any).invoice === null) {
    return;
  }

  // Handle subscription lifecycle events
  await syncCustomerFromStripe(customerId);
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
        const { error: profileCancelError } = await supabase
          .from('profiles')
          .update({ is_premium: false, subscription_expiry: null })
          .eq('id', profileId);

        if (profileCancelError) {
          console.error('Error removing profile premium status:', profileCancelError);
        }

        const { error: tierCancelError } = await supabase
          .from('tradie_details')
          .update({ subscription_tier: 'free' })
          .eq('profile_id', profileId);

        if (tierCancelError) {
          console.error('Error resetting tradie subscription tier:', tierCancelError);
        }
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

      // Sync subscription_tier in tradie_details (no-op if user is not a tradie)
      const { error: tierUpdateError } = await supabase
        .from('tradie_details')
        .update({ subscription_tier: isActive ? 'pro' : 'free' })
        .eq('profile_id', profileId);

      if (tierUpdateError) {
        console.error('Error updating tradie subscription tier:', tierUpdateError);
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
