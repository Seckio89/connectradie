import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    // If the token is the service role key itself (cron job), skip user auth.
    // Otherwise validate the calling user is an admin.
    if (token !== supabaseServiceKey) {
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
    for (const pi of stripePayments.data) {
      stripeStatusMap.set(pi.id, pi.status);
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

      if (payment.status !== mappedStatus) {
        mismatchesFound++;

        const updatePayload: Record<string, unknown> = {
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
