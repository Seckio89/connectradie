// Sweep cron for recurring_invoices whose payment succeeded but whose payout to
// the tradie never landed. Companion to auto-release-payments (which only
// handles the one-off payments table). This function recovers from:
//
//   1. Legacy webhook paths where stripe.transfers.create threw and the error
//      was logged but no state was written — invoice sat at payout_status=NULL.
//   2. Tradie Connect account not yet onboarded at webhook time — flagged as
//      held_onboarding_incomplete or held_no_connect — pickable on retry once
//      onboarding completes.
//   3. Transient transfer failures — flagged held_transfer_error — retried
//      until success.
//
// Idempotency keys EXACTLY mirror the original webhook attempts
// (`becs_transfer_${invoice_id}_${pi_id}` for BECS, `checkout_transfer_${invoice_id}_${session_id}` for cards),
// so if the original transfer actually landed at Stripe but the webhook's DB
// write was lost, Stripe returns the same transfer instead of double-paying.
//
// Eligible invoices: status='paid', payout_status IS NULL OR payout_status LIKE 'held_%',
// paid_at < now() - 1 hour. The 1-hour window gives the webhook room to
// complete on the happy path before the sweep tries.
//
// Safe to run hourly. Cancellation status of the parent recurring_job is
// intentionally NOT a filter — paid invoices belong to the tradie regardless
// of whether the client has since cancelled the service.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PayoutResult = {
  invoice_id: string;
  outcome: "transferred" | "held_no_connect" | "held_transfer_error" | "skipped" | "already_settled";
  reason?: string;
  transfer_id?: string;
  amount_cents?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    let supabaseUrl: string, supabaseServiceKey: string, stripeSecretKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    } catch (e) {
      console.error(e);
      return errorJson("Server configuration error", 500);
    }

    // Defence-in-depth: caller has passed verify_jwt=true, but require a JWT
    // bearer to avoid surprises if the function gets reconfigured later.
    // Deliberately NOT byte-compared against env var — auto-injected service
    // role key can drift from the vault secret used by pg_cron after rotation.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // status='paid' AND (payout_status IS NULL OR payout_status starts with 'held_')
    //                AND paid_at <= cutoff
    // Supabase doesn't expose a single OR with NULL + LIKE easily — split into
    // two queries and merge in JS for clarity.
    const [nullRes, heldRes] = await Promise.all([
      supabase
        .from("recurring_invoices")
        .select("id, recurring_job_id, tradie_id, total, stripe_payment_intent_id, stripe_checkout_session_id, payment_method, paid_at")
        .eq("status", "paid")
        .is("payout_status", null)
        .lte("paid_at", cutoffIso),
      supabase
        .from("recurring_invoices")
        .select("id, recurring_job_id, tradie_id, total, stripe_payment_intent_id, stripe_checkout_session_id, payment_method, paid_at")
        .eq("status", "paid")
        .like("payout_status", "held_%")
        .lte("paid_at", cutoffIso),
    ]);

    if (nullRes.error) {
      console.error("Failed to fetch null-payout-status invoices:", nullRes.error);
      return errorJson("Failed to fetch invoices", 500);
    }
    if (heldRes.error) {
      console.error("Failed to fetch held invoices:", heldRes.error);
      return errorJson("Failed to fetch invoices", 500);
    }

    const invoices = [...(nullRes.data || []), ...(heldRes.data || [])];

    if (invoices.length === 0) {
      return jsonResponse({ processed: 0, released: 0, total_amount_cents: 0, results: [] });
    }

    const results: PayoutResult[] = [];
    let released = 0;
    let totalAmount = 0;

    for (const inv of invoices) {
      if (!inv.tradie_id) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "no tradie_id on invoice" });
        continue;
      }

      if (!inv.stripe_payment_intent_id && !inv.stripe_checkout_session_id) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "no stripe payment reference" });
        continue;
      }

      // Pull the PI to read the original metadata (platform_fee, processing_fee,
      // routing flag, tradie_id). This is the canonical source — what the
      // webhook would have used.
      let pi: Stripe.PaymentIntent | null = null;
      try {
        if (inv.stripe_payment_intent_id) {
          pi = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent_id);
        } else if (inv.stripe_checkout_session_id) {
          const session = await stripe.checkout.sessions.retrieve(inv.stripe_checkout_session_id, { expand: ["payment_intent"] });
          if (typeof session.payment_intent === "string") {
            pi = await stripe.paymentIntents.retrieve(session.payment_intent);
          } else if (session.payment_intent) {
            pi = session.payment_intent as Stripe.PaymentIntent;
          }
        }
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`Invoice ${inv.id}: failed to fetch Stripe PI — ${msg}`);
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: `stripe fetch failed: ${msg}` });
        continue;
      }

      if (!pi) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "could not resolve payment intent" });
        continue;
      }

      // If the charge was a destination charge, funds already routed at charge
      // time — just record transferred and move on.
      const routedAtCharge = pi.metadata?.routing === "destination";
      if (routedAtCharge) {
        await supabase
          .from("recurring_invoices")
          .update({ payout_status: "transferred" })
          .eq("id", inv.id);
        results.push({ invoice_id: inv.id, outcome: "already_settled", reason: "destination charge — routed at charge time" });
        continue;
      }

      // Legacy path: pull amounts from PI metadata to mirror the original
      // webhook math exactly.
      const platformFeeCents = pi.metadata?.platform_fee ? parseInt(pi.metadata.platform_fee, 10) : 0;
      const processingFeeCents = pi.metadata?.processing_fee ? parseInt(pi.metadata.processing_fee, 10) : 0;
      const baseAmount = pi.amount - processingFeeCents;
      const transferAmount = baseAmount - platformFeeCents;

      if (transferAmount <= 0) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: `non-positive transfer amount (${transferAmount})` });
        continue;
      }

      // Check tradie's Connect account
      const { data: tradieProfile } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_onboarding_complete, email, full_name")
        .eq("id", inv.tradie_id)
        .maybeSingle();

      if (!tradieProfile?.stripe_connect_account_id || !tradieProfile.stripe_connect_onboarding_complete) {
        // Flag and continue — sweep will retry once onboarding completes.
        await supabase
          .from("recurring_invoices")
          .update({
            payout_status: "held_no_connect",
            payout_error_message: `Tradie has no completed Stripe Connect account (account_id=${tradieProfile?.stripe_connect_account_id ?? "none"}, onboarding_complete=${tradieProfile?.stripe_connect_onboarding_complete ?? false}).`,
          })
          .eq("id", inv.id);
        results.push({
          invoice_id: inv.id,
          outcome: "held_no_connect",
          reason: `tradie ${inv.tradie_id} has no completed Connect account`,
        });
        continue;
      }

      // Idempotency key MUST match the original webhook's so a previously
      // succeeded-but-unrecorded transfer isn't duplicated.
      const isBecs = inv.payment_method === "au_becs_debit" || pi.metadata?.type === "recurring_invoice_becs";
      const idempotencyKey = isBecs
        ? `becs_transfer_${inv.id}_${pi.id}`
        : inv.stripe_checkout_session_id
          ? `checkout_transfer_${inv.id}_${inv.stripe_checkout_session_id}`
          : `sweep_transfer_${inv.id}_${pi.id}`;

      try {
        const transfer = await stripe.transfers.create({
          amount: transferAmount,
          currency: "aud",
          destination: tradieProfile.stripe_connect_account_id,
          transfer_group: `recurring_${inv.recurring_job_id}`,
          metadata: {
            type: "recurring_invoice_payout",
            recurring_job_id: inv.recurring_job_id ?? "",
            tradie_id: inv.tradie_id,
            invoice_id: inv.id,
            platform_fee: String(platformFeeCents),
            swept: "true",
          },
        }, { idempotencyKey });

        await supabase
          .from("recurring_invoices")
          .update({ payout_status: "transferred", payout_error_message: null })
          .eq("id", inv.id);

        results.push({
          invoice_id: inv.id,
          outcome: "transferred",
          transfer_id: transfer.id,
          amount_cents: transferAmount,
        });
        released++;
        totalAmount += transferAmount;

        // Notify tradie that the held payout has now landed.
        try {
          await supabase.from("notifications").insert({
            user_id: inv.tradie_id,
            title: "Payout Released",
            message: `A previously held payout of $${(transferAmount / 100).toFixed(2)} for a recurring service invoice has been released to your account.`,
            type: "payment_received",
            read: false,
            metadata: { invoice_id: inv.id, transfer_id: transfer.id, recurring_job_id: inv.recurring_job_id },
          });
        } catch (notifErr) {
          console.error(`Failed to notify tradie for swept payout on invoice ${inv.id}:`, notifErr);
        }

        console.info(`Swept payout: invoice ${inv.id} → transfer ${transfer.id} (${transferAmount} cents to ${inv.tradie_id})`);
      } catch (transferErr) {
        const msg = transferErr instanceof Error ? transferErr.message : String(transferErr);
        // Extract Stripe error code if present for cleaner DB storage.
        const stripeCode = (transferErr as { code?: string } | undefined)?.code;
        const storedMsg = stripeCode ? `[${stripeCode}] ${msg}` : msg;
        console.error(`Sweep transfer failed for invoice ${inv.id}: ${storedMsg}`);
        await supabase
          .from("recurring_invoices")
          .update({
            payout_status: "held_transfer_error",
            payout_error_message: storedMsg.slice(0, 500),
          })
          .eq("id", inv.id);
        results.push({ invoice_id: inv.id, outcome: "held_transfer_error", reason: storedMsg });
      }
    }

    return jsonResponse({
      processed: invoices.length,
      released,
      total_amount_cents: totalAmount,
      total_amount_dollars: `$${(totalAmount / 100).toFixed(2)}`,
      results,
    });
  } catch (err) {
    console.error("auto-release-recurring-payouts error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
