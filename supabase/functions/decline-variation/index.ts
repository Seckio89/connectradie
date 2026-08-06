// Decline a job variation.
//
// This used to be a raw client-side UPDATE from JobDetailsCard, which was both
// the security hole (see 20260803035919_lock_down_job_variations_writes.sql)
// and a permanent deadlock: approving stamps a pending_increase onto the job's
// funding payment BEFORE the client reaches Stripe, and nothing but settlement
// or escrow release ever cleared that slot. Approve → close the Stripe tab →
// decline, and every future variation on the job 409'd forever against an error
// message telling the user to "cancel that one first".
//
// The ordering here is load-bearing. The Stripe Checkout Session stays payable
// for ~24h after it is created, so declining without killing it leaves a live
// tab pointing at a variation we are about to mark 'rejected'. If the client
// then paid it, applyPriceAdjustment's status guard would match zero rows: the
// card is charged, the money lands in the tradie's Connect balance, and
// jobs.budget_amount never moves. So: expire the session FIRST, flip the status
// second.
//
// Failing between those two steps is recoverable — a killed session with a
// still-'pending' variation just means re-approving mints a fresh one
// (pay-price-increase clears the stale row). The reverse order is not.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { selectFundingPaymentForVariation } from "../_shared/selectFundingPayment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function okJson(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Exported so guards.test.ts can call it with a fabricated Request.
// `import.meta.main` is true for the runtime entrypoint and false when a test
// imports this module, so importing it does not start a server.
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorJson(authError?.message || "Unauthorized", 401);
    }

    const { allowed } = await checkRateLimit(`${user.id}-decline-variation`, 10, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorJson("Invalid JSON body", 400);
    }

    const { variationId } = body as { variationId?: string };
    if (!variationId) {
      return errorJson("Missing required parameter: variationId", 400);
    }

    // -----------------------------------------------------------------------
    // 1. Load the variation
    // -----------------------------------------------------------------------
    const { data: variation, error: variationError } = await supabase
      .from("job_variations")
      .select("id, job_id, additional_amount, status, description")
      .eq("id", variationId)
      .maybeSingle();

    if (variationError || !variation) {
      return errorJson("Variation not found", 404);
    }

    if (variation.status !== "pending") {
      return errorJson(
        `This variation is already ${variation.status}. Refresh to see its current state.`,
        409,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Verify the caller is the client on the job
    // -----------------------------------------------------------------------
    // Client only. A tradie withdrawing their own variation is a separate
    // feature, even though approve-variation's 409 copy mentions cancelling.
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, title")
      .eq("id", variation.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson("Only the client on this job can decline a variation", 403);
    }

    // -----------------------------------------------------------------------
    // 3. Find the funding payment and the slot this variation may be holding
    // -----------------------------------------------------------------------
    // Milestone jobs carry one completed job_funding row per milestone
    // (pay-milestone), so .maybeSingle() here returned PGRST116 and 500'd —
    // leaving the client unable to decline as well as unable to approve. Pick
    // the row actually holding a slot; declining only ever needs that one.
    const { data: fundingPayments, error: paymentError } = await supabase
      .from("payments")
      .select("id, metadata")
      .eq("job_id", variation.job_id)
      .eq("payment_type", "job_funding")
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (paymentError) {
      console.error("Failed to load funding payment:", paymentError);
      return errorJson("Could not load this job's payment", 500);
    }

    const payment = selectFundingPaymentForVariation(fundingPayments, variationId);

    const existingMetadata = (payment?.metadata || {}) as Record<string, unknown>;
    const inFlight = existingMetadata.pending_increase as
      | { variation_id?: string }
      | undefined;
    // Only touch the slot when it belongs to THIS variation. A quote adjustment
    // (no variation_id) or another variation's increase must be left alone.
    const holdsOurSlot = Boolean(payment) && inFlight?.variation_id === variationId;

    // -----------------------------------------------------------------------
    // 4. Kill the live Stripe session before anything becomes irreversible
    // -----------------------------------------------------------------------
    let childPaymentId: string | null = null;

    if (holdsOurSlot) {
      const { data: childPayment } = await supabase
        .from("payments")
        .select("id, status, stripe_checkout_session_id, metadata")
        .eq("parent_payment_id", payment!.id)
        .eq("payment_type", "price_adjustment")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (childPayment?.stripe_checkout_session_id) {
        const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (!stripeSecretKey) {
          return errorJson("Server configuration error", 500);
        }
        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

        try {
          const session = await stripe.checkout.sessions.retrieve(
            childPayment.stripe_checkout_session_id,
          );

          // Retrieve-then-expire rather than expire-and-catch: a session the
          // client just paid must stop the decline dead, and that is a
          // different outcome from one that merely lapsed on its own.
          if (session.status === "complete" || session.payment_status === "paid") {
            return errorJson(
              "This variation was just paid for. Refresh to see it approved.",
              409,
            );
          }

          if (session.status === "open") {
            await stripe.checkout.sessions.expire(
              childPayment.stripe_checkout_session_id,
            );
          }
        } catch (stripeErr) {
          console.error("Failed to expire checkout session:", stripeErr);
          return errorJson(
            "Could not cancel the payment page for this variation. Please try again in a moment.",
            502,
          );
        }
      }

      if (childPayment) {
        childPaymentId = childPayment.id;
        // 'failed' rather than DELETE: the attempt is part of the job's money
        // history, and payments_status_check already allows it.
        await supabase
          .from("payments")
          .update({
            status: "failed",
            metadata: {
              ...((childPayment.metadata || {}) as Record<string, unknown>),
              cancelled_reason: "variation_declined",
              cancelled_at: new Date().toISOString(),
            },
          })
          .eq("id", childPayment.id);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Flip the variation. The status filter is the idempotency guard.
    // -----------------------------------------------------------------------
    const { data: flipped, error: flipError } = await supabase
      .from("job_variations")
      .update({ status: "rejected" })
      .eq("id", variationId)
      .eq("status", "pending")
      .select("id");

    if (flipError) {
      console.error(`Failed to decline variation ${variationId}:`, flipError);
      return errorJson("Could not decline this variation. Please try again.", 500);
    }

    if (!flipped || flipped.length === 0) {
      return errorJson(
        "This variation was just actioned somewhere else. Refresh to see its current state.",
        409,
      );
    }

    // -----------------------------------------------------------------------
    // 6. Free the slot so the next variation on this job can be funded
    // -----------------------------------------------------------------------
    if (holdsOurSlot) {
      const meta = { ...existingMetadata };
      delete meta.pending_increase;
      meta.increase_cancelled_at = new Date().toISOString();

      const { error: slotError } = await supabase
        .from("payments")
        .update({ metadata: meta })
        .eq("id", payment!.id);

      if (slotError) {
        // Loud: the variation is already 'rejected', so nothing retries this,
        // and a slot left set 409s every future increase on the job.
        console.error(
          `ALERT variation ${variationId} declined but pending_increase NOT cleared on payment ${
            payment!.id
          }: ${slotError.message}. Future price changes on job ${variation.job_id} will be blocked.`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 7. Tell the tradie
    // -----------------------------------------------------------------------
    if (job.tradie_id) {
      try {
        await supabase.from("notifications").insert({
          user_id: job.tradie_id,
          type: "variation_declined",
          title: "Additional cost declined",
          message: `The homeowner declined your $${
            Number(variation.additional_amount).toFixed(2)
          } additional cost on ${job.title || "this job"}. Talk to them before doing the extra work.`,
          job_id: variation.job_id,
          metadata: {
            variation_id: variationId,
            additional_amount: Number(variation.additional_amount),
          },
          read: false,
        });
      } catch {
        // Non-critical
      }
    }

    return okJson({
      variationId,
      jobId: variation.job_id,
      status: "rejected",
      slotCleared: holdsOurSlot,
      cancelledPaymentId: childPaymentId,
    });
  } catch (err) {
    console.error("Error in decline-variation:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
};

if (import.meta.main) Deno.serve(handler);
