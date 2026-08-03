// Approve a job variation by funding it.
//
// A variation is a scope change the tradie raised mid-job: "rot found in the
// subfloor, +$1,200". Approving it used to be a client-side write that set
// job_variations.status='approved' and raised jobs.budget_amount — which meant
// the job was worth more with nothing funding the difference, and the client's
// browser was trusted to write the job's value.
//
// This function does NOT approve the variation. It prices the variation and
// stamps a pending_increase onto the job's completed funding payment, then
// hands back that payment id so the client can be sent through the existing,
// proven pay-price-increase checkout. The variation flips to 'approved' and the
// budget rises only when stripe-webhook confirms the money landed.
//
// Fee treatment matches adjust-quote-price deliberately: under pricing v2.1 a
// variation is additional work, i.e. labour. It does not retroactively add
// materials to the original quote.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { calculateGstCents, resolveTradieTier } from "../_shared/pricing.ts";
import { resolveChargeFee } from "../_shared/feeContext.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

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

// Exported so tests can call it with a fabricated Request. `import.meta.main`
// is true for the runtime entrypoint and false when a test imports this module,
// so importing it does not start a server.
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

    const { allowed } = await checkRateLimit(`${user.id}-approve-variation`, 5, 60000);
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

    // additional_amount is DOLLARS on job_variations; payments.amount is CENTS.
    const diffCents = Math.round(Number(variation.additional_amount) * 100);
    if (!Number.isFinite(diffCents) || diffCents <= 0) {
      return errorJson(
        "This variation has no additional cost to pay. Ask the tradie to re-submit it.",
        400,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Verify the caller is the client on the job
    // -----------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, title")
      .eq("id", variation.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson("Only the client on this job can approve a variation", 403);
    }

    if (!job.tradie_id) {
      return errorJson("No tradie assigned to this job", 400);
    }

    // -----------------------------------------------------------------------
    // 3. Tradie must be able to receive the money
    // -----------------------------------------------------------------------
    const { data: tradieProfile, error: tradieError } = await supabase
      .from("profiles")
      .select(
        "is_gst_registered, platform_fee_override_bps, stripe_connect_account_id, stripe_connect_onboarding_complete",
      )
      .eq("id", job.tradie_id)
      .maybeSingle();

    if (tradieError || !tradieProfile) {
      return errorJson("Tradie profile not found", 404);
    }

    if (
      !tradieProfile.stripe_connect_account_id ||
      !tradieProfile.stripe_connect_onboarding_complete
    ) {
      return errorJson(
        "This tradie hasn't finished setting up their payout account yet. They need to complete Stripe onboarding before you can approve this variation.",
        400,
      );
    }

    // -----------------------------------------------------------------------
    // 4. Find the job's escrow funding payment
    // -----------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, metadata, amount")
      .eq("job_id", variation.job_id)
      .eq("payment_type", "job_funding")
      .eq("status", "completed")
      .maybeSingle();

    if (paymentError) {
      console.error("Failed to load funding payment:", paymentError);
      return errorJson("Could not load this job's payment", 500);
    }

    if (!payment) {
      // The lookup above filters status='completed'. Both release paths set the
      // funding payment to 'released', so an already-paid-out job lands here
      // too — and telling that client the job "hasn't been funded yet" is
      // simply false. Distinguish the two before choosing the message.
      const { data: anyFunding } = await supabase
        .from("payments")
        .select("status")
        .eq("job_id", variation.job_id)
        .eq("payment_type", "job_funding")
        .neq("status", "failed")
        .limit(1)
        .maybeSingle();

      return errorJson(
        anyFunding
          ? "The payment for this job has already been released to the tradie, so it can't be topped up. Ask them to invoice you for the extra work."
          : "This job hasn't been funded yet, so there's nothing to add to. Accept and pay for the quote first.",
        400,
      );
    }

    const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;

    // pending_increase is a single slot on the payment. Two increases in flight
    // at once would silently overwrite each other and the client would pay one
    // amount while the other variation waited forever.
    const inFlight = existingMetadata.pending_increase as
      | {
        variation_id?: string;
        diff_cents?: number;
        additional_gst?: number;
        additional_processing_fee?: number;
      }
      | undefined;
    if (inFlight) {
      if (inFlight.variation_id !== variationId) {
        return errorJson(
          "Another price change on this job is already awaiting payment. Finish or cancel that one first.",
          409,
        );
      }

      // Same variation: resume rather than dead-end. The client opened the
      // Stripe page, closed it, and came back — 409ing here left declining as
      // the only way forward, and declining used to strand the slot for good.
      //
      // The figures come from the STORED slot, never from re-running the
      // pricing below. pay-price-increase bills off this same metadata, so
      // re-pricing here would quote a total Stripe will not charge if the fee
      // configuration moved in between.
      const storedDiff = typeof inFlight.diff_cents === "number" ? inFlight.diff_cents : diffCents;
      const storedGst = typeof inFlight.additional_gst === "number" ? inFlight.additional_gst : 0;
      const storedProcessing = typeof inFlight.additional_processing_fee === "number"
        ? inFlight.additional_processing_fee
        : 0;

      return new Response(
        JSON.stringify({
          paymentId: payment.id,
          jobId: variation.job_id,
          diffCents: storedDiff,
          gstCents: storedGst,
          totalCents: storedDiff + storedGst + storedProcessing,
          resumed: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // 5. Price the variation
    // -----------------------------------------------------------------------
    // v2.1: no client-side processing surcharge on an increase.
    const additionalProcessingFee = 0;
    const additionalGstCents = tradieProfile.is_gst_registered === true
      ? calculateGstCents(diffCents)
      : 0;

    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", job.tradie_id)
      .maybeSingle();

    const tradieTier = resolveTradieTier(tradieSubRecord?.subscription_tier);
    const additionalFee = await resolveChargeFee(supabase, {
      amountCents: diffCents,
      tier: tradieTier,
      overrideBps: tradieProfile.platform_fee_override_bps ?? null,
      tradieId: job.tradie_id,
      clientId: job.client_id,
      jobId: variation.job_id,
    });
    const additionalPlatformFeeCents = additionalFee.applicationFeeAmount;

    // -----------------------------------------------------------------------
    // 6. Stamp the pending increase. The variation stays 'pending'.
    // -----------------------------------------------------------------------
    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        metadata: {
          ...existingMetadata,
          pending_increase: {
            diff_cents: diffCents,
            additional_gst: additionalGstCents,
            additional_processing_fee: additionalProcessingFee,
            additional_platform_fee: additionalPlatformFeeCents,
            requested_at: new Date().toISOString(),
            requested_by: user.id,
            // The marker that makes this a variation rather than a quote
            // adjustment. pay-price-increase forwards it to Stripe, and
            // stripe-webhook uses it to approve the variation on completion.
            variation_id: variationId,
          },
        },
      })
      .eq("id", payment.id);

    if (paymentUpdateError) {
      console.error("Failed to store pending_increase:", paymentUpdateError);
      return errorJson(
        "Could not start the payment for this variation. Please try again.",
        500,
      );
    }

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        jobId: variation.job_id,
        diffCents,
        gstCents: additionalGstCents,
        totalCents: diffCents + additionalGstCents + additionalProcessingFee,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in approve-variation:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
};

if (import.meta.main) Deno.serve(handler);
