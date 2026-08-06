import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import type { Update } from "../_shared/dbTypes.ts";
import { applyPriceAdjustment } from "../_shared/priceAdjustment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Authenticate caller — must be an admin or a cron invocation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Is the caller service-role capable? Verified by CAPABILITY, not by
    // byte-comparing against SUPABASE_SERVICE_ROLE_KEY.
    //
    // The byte-compare was fragile in exactly the way auto-release-payments
    // already documents: it only matches the one key shape the function happens
    // to have in its env, so a rotated key — or the newer sb_secret_* format —
    // silently stops matching and a legitimate cron invocation 401s. Caught by
    // the e2e harness, which presented a valid service key and was rejected.
    let isServiceCaller = false;
    try {
      const probe = createClient(supabaseUrl, token);
      const { error: probeErr } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
      isServiceCaller = !probeErr;
    } catch {
      isServiceCaller = false;
    }

    // Otherwise validate the calling user is an admin.
    if (!isServiceCaller) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (callerProfile?.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: admin access required" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ---- Reconciliation logic ----

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Look back 48 hours
    const fortyEightHoursAgo = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
    const cutoffISO = new Date(fortyEightHoursAgo * 1000).toISOString();

    // 1. Fetch recent payment intents from Stripe (paginate up to 100)
    const stripePayments = await stripe.paymentIntents.list({
      created: { gte: fortyEightHoursAgo },
      limit: 100,
    });

    // Build a map of stripe_payment_intent_id -> Stripe status
    const stripeStatusMap = new Map<string, string>();
    // ...and payment_record_id -> intent, for rows that never got a PI id
    // written locally. Every charge path stamps payment_record_id into the
    // intent's metadata, so this finds the money without needing our own row to
    // already know about it.
    const piByPaymentRecord = new Map<string, { id: string; status: string }>();
    for (const pi of stripePayments.data) {
      stripeStatusMap.set(pi.id, pi.status);
      const recordId = pi.metadata?.payment_record_id;
      if (recordId) piByPaymentRecord.set(recordId, { id: pi.id, status: pi.status });
    }

    // 2. Fetch local payments created in the last 48 hours OR still pending
    const { data: localPayments, error: queryError } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, status, amount, profile_id")
      .or(`created_at.gte.${cutoffISO},status.eq.pending`)
      .not("stripe_payment_intent_id", "is", null);

    if (queryError) {
      return new Response(
        JSON.stringify({ error: queryError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentsChecked = localPayments?.length ?? 0;
    let mismatchesFound = 0;
    let mismatchesFixed = 0;
    const details: Array<{
      payment_id: string;
      stripe_payment_intent_id: string;
      old_status: string;
      new_status: string;
      stripe_status: string;
    }> = [];
    const errors: string[] = [];

    // Map Stripe payment intent status to our local status vocabulary
    function mapStripeStatus(stripeStatus: string): string | null {
      switch (stripeStatus) {
        case "succeeded":
          return "completed";
        case "canceled":
          return "failed";
        case "requires_payment_method":
        case "requires_confirmation":
        case "requires_action":
        case "processing":
          return "pending";
        default:
          return null; // Unknown — do not update
      }
    }

    for (const payment of localPayments ?? []) {
      const piId = payment.stripe_payment_intent_id;
      if (!piId) continue;

      let stripeStatus: string | undefined = stripeStatusMap.get(piId);

      // If the payment intent was not in our 48-hour list (e.g. older pending
      // record), fetch it individually from Stripe.
      if (stripeStatus === undefined) {
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          stripeStatus = pi.status;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown Stripe error";
          errors.push(
            `Failed to retrieve payment intent ${piId}: ${msg}`
          );
          continue;
        }
      }

      const mappedStatus = mapStripeStatus(stripeStatus);
      if (!mappedStatus) continue; // Unrecognised status — skip

      // NEVER downgrade a terminal local status (CRITICAL).
      //
      // A Stripe PaymentIntent stays `succeeded` after it has been refunded —
      // refunding does not change PI status, and there is no `refunded` PI status
      // to map. So a refunded payment looks like a `succeeded` vs `refunded`
      // "mismatch" and, without this guard, gets written back to `completed`.
      // auto-release-payments then selects it (it wants status='completed' and
      // only skips on transfer_id/payout_id, neither of which a refund sets) and
      // pays the tradie money the client has already been refunded — the platform
      // loses the refund AND the payout. The same path also reverted
      // `released` -> `completed`.
      //
      // These states are decided by process-refund / release-escrow, which know
      // things Stripe's PI status cannot express. Report the divergence; never
      // overwrite it.
      const TERMINAL_STATUSES = ["refunded", "released", "disputed"];
      if (TERMINAL_STATUSES.includes(payment.status)) {
        if (payment.status !== mappedStatus) {
          mismatchesFound++;
          errors.push(
            `Payment ${payment.id}: local status '${payment.status}' is terminal; ` +
              `Stripe reports '${stripeStatus}'. Left unchanged — review manually.`,
          );
        }
        continue;
      }

      if (payment.status !== mappedStatus) {
        mismatchesFound++;

        // Annotated, not `Record<string, unknown>`: the annotation is what makes
        // every key below column-checked. See ../_shared/dbTypes.ts.
        const updatePayload: Update<"payments"> = {
          status: mappedStatus,
        };
        if (mappedStatus === "completed" && payment.status !== "completed") {
          updatePayload.completed_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from("payments")
          .update(updatePayload)
          .eq("id", payment.id);

        if (updateError) {
          errors.push(
            `Failed to update payment ${payment.id}: ${updateError.message}`
          );
        } else {
          mismatchesFixed++;
          details.push({
            payment_id: payment.id,
            stripe_payment_intent_id: piId,
            old_status: payment.status,
            new_status: mappedStatus,
            stripe_status: stripeStatus,
          });

          console.info(
            `Reconciled payment ${payment.id}: ${payment.status} -> ${mappedStatus} (Stripe: ${stripeStatus})`
          );
        }
      }
    }

    // 2b. Price adjustments stranded before they ever got a PaymentIntent id.
    //
    // The loop above cannot see these. It filters on
    // `stripe_payment_intent_id is not null`, and for a price_adjustment that
    // column is written by stripe-webhook — so a payment whose webhook never
    // arrived has a NULL there and is skipped by the very job meant to catch
    // it. All pay-price-increase records at creation is the checkout session
    // id, so that is what we match on instead.
    //
    // Status alone is not enough here either. A stranded price adjustment
    // leaves the variation 'pending', the budget unmoved, and pending_increase
    // still held — which 409s every future increase on that job. Flipping the
    // row to 'completed' without applying those effects would hide the wedge
    // rather than fix it, so this calls the same applyPriceAdjustment the
    // webhook does.
    const { data: strandedAdjustments, error: strandedErr } = await supabase
      .from("payments")
      .select("id, status, job_id, stripe_checkout_session_id, metadata")
      .eq("payment_type", "price_adjustment")
      .eq("status", "pending")
      .is("stripe_payment_intent_id", null)
      .not("stripe_checkout_session_id", "is", null);

    if (strandedErr) {
      errors.push(`Could not query stranded price adjustments: ${strandedErr.message}`);
    }

    for (const adj of strandedAdjustments ?? []) {
      try {
        // Where did the money land? Two places to look, and they differ:
        //  • the session's own payment_intent — set once a payer opens the
        //    hosted checkout page, which is the normal browser path;
        //  • a separate PaymentIntent carrying payment_record_id metadata —
        //    every server-side charge path stamps it, and the 48h intent list
        //    above indexes it.
        // Checked in that order; a session that was never opened has no intent
        // and expired sessions are the normal case here.
        let piId: string | null = null;
        const session = await stripe.checkout.sessions.retrieve(
          adj.stripe_checkout_session_id as string,
        );
        if (session.payment_intent) {
          piId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent.id;
        } else {
          piId = piByPaymentRecord.get(adj.id as string)?.id ?? null;
        }
        if (!piId) continue;

        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.status !== "succeeded") continue;

        mismatchesFound++;

        const updatePayload: Update<"payments"> = {
          status: "completed",
          completed_at: new Date().toISOString(),
          stripe_payment_intent_id: piId,
        };
        const { error: adjUpdateErr } = await supabase
          .from("payments")
          .update(updatePayload)
          .eq("id", adj.id)
          .eq("status", "pending");

        if (adjUpdateErr) {
          errors.push(`Failed to complete stranded adjustment ${adj.id}: ${adjUpdateErr.message}`);
          continue;
        }

        // Runs regardless of whether this call won the race to flip the status
        // — the webhook may have completed the payment and then failed before
        // applying the effects. Every step inside is individually guarded.
        await applyPriceAdjustment(supabase, {
          parentPaymentId: (adj.metadata?.parent_payment_id as string) ?? null,
          jobId: (adj.job_id as string) ?? null,
          variationId: (adj.metadata?.variation_id as string) ?? null,
        });

        mismatchesFixed++;
        details.push({
          payment_id: adj.id,
          stripe_payment_intent_id: piId,
          old_status: "pending",
          new_status: "completed",
          stripe_status: pi.status,
        });
        console.info(
          `Recovered stranded price_adjustment ${adj.id} (pi=${piId}) and applied its effects`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown Stripe error";
        errors.push(`Failed to recover price adjustment ${adj.id}: ${msg}`);
      }
    }

    // 3. Log the reconciliation run
    const { error: logError } = await supabase
      .from("payment_reconciliation_log")
      .insert({
        payments_checked: paymentsChecked,
        mismatches_found: mismatchesFound,
        mismatches_fixed: mismatchesFixed,
        details: { changes: details, errors },
      });

    if (logError) {
      console.error("Failed to write reconciliation log:", logError.message);
    }

    const summary = {
      payments_checked: paymentsChecked,
      mismatches_found: mismatchesFound,
      mismatches_fixed: mismatchesFixed,
      details,
      errors: errors.length > 0 ? errors : undefined,
      message: `Reconciliation complete. Checked ${paymentsChecked} payment(s), found ${mismatchesFound} mismatch(es), fixed ${mismatchesFixed}.`,
    };

    console.info(summary.message);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Reconciliation failed:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
