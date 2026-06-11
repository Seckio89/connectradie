import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateProcessingFeeCents } from "../_shared/pricing.ts";

/*
  book-site-visit — stage 2 of the 3-stage quote flow.

  The client books a site visit on a quote that requires one. The tradie's
  call-out fee (quotes.call_out_fee_cents) is collected here via Stripe Checkout
  and routed straight to the tradie (destination charge) — it compensates their
  visit time and is credited against the final price at accept-and-pay. The
  escrow deposit for the job itself does NOT land here; it lands at stage 4.

  Flow:
    - fee > 0  : create a Checkout session, return its URL. The quote only flips
                 to site_visit_scheduled once stripe-webhook confirms payment.
    - fee == 0 : tradie offers a free visit — flip the quote immediately.

  Only works for jobs.flow_version = 2.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function notifyTradieVisitBooked(
  supabase: ReturnType<typeof createClient>,
  args: { tradieId: string; jobId: string; quoteId: string; clientId: string; jobTitle: string; siteVisitDate?: string | null; feePaid: boolean },
) {
  const dateLine = args.siteVisitDate
    ? ` Suggested date: ${new Date(args.siteVisitDate + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long" })}.`
    : "";
  const feeLine = args.feePaid ? " Your call-out fee has been paid." : "";
  await supabase.from("notifications").insert({
    user_id: args.tradieId,
    type: "site_visit_requested",
    title: "Site visit booked",
    message: `A client booked a site visit for ${args.jobTitle}. Address has been shared.${feeLine} Once you complete the visit, submit your final quote.${dateLine}`,
    job_id: args.jobId,
    metadata: { quote_id: args.quoteId, client_id: args.clientId, suggested_date: args.siteVisitDate ?? null },
    read: false,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return errorJson("Server configuration error", 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return errorJson("Missing Authorization header", 401);
    const token = authHeader.slice(7);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return errorJson(authError?.message || "Unauthorized", 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorJson("Invalid JSON body", 400);
    }

    const { quoteId, siteVisitDate, visitStart, visitEnd, timeConfirmed } = body as {
      quoteId?: string;
      siteVisitDate?: string;
      visitStart?: string;   // ISO datetime — the chosen visit start
      visitEnd?: string;     // ISO datetime — estimated end (start + duration)
      timeConfirmed?: boolean; // true if picked from the tradie's published availability
    };
    if (!quoteId) return errorJson("Missing required parameter: quoteId", 400);

    // 1. Look up the quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, job_id, tradie_id, status, requires_site_inspection, call_out_fee_cents, site_visit_fee_status")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) return errorJson("Quote not found", 404);

    if (!quote.requires_site_inspection) {
      return errorJson(
        "This quote does not require a site visit — the tradie can submit a final price directly.",
        400,
      );
    }

    if (quote.status !== "pending") {
      return errorJson(`Cannot book a site visit on a quote in status '${quote.status}'`, 409);
    }

    // 2. Look up the job — must belong to this client + be on the 3-stage flow
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, title, description, flow_version, location_address")
      .eq("id", quote.job_id)
      .maybeSingle();

    if (jobError || !job) return errorJson("Job not found", 404);
    if (job.client_id !== user.id) {
      return errorJson("Only the client on this job can book a site visit", 403);
    }
    if (job.flow_version !== 2) {
      return errorJson(
        "This job is on the legacy single-step quote flow. Use accept-and-pay instead.",
        400,
      );
    }

    const jobTitle = job.title
      || job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ")
      || "a job";
    const feeCents = Number(quote.call_out_fee_cents) || 0;

    // ── Free visit (tradie set no call-out fee): flip immediately, no payment ──
    if (feeCents <= 0) {
      const { error: updErr } = await supabase
        .from("quotes")
        .update({
          status: "site_visit_scheduled",
          site_visit_scheduled_at: visitStart || new Date().toISOString(),
          site_visit_ends_at: visitEnd || null,
          site_visit_time_confirmed: timeConfirmed ?? false,
        })
        .eq("id", quoteId);
      if (updErr) {
        console.error("book-site-visit: failed to update quote", updErr);
        return errorJson("Failed to book site visit", 500);
      }
      try {
        await notifyTradieVisitBooked(supabase, {
          tradieId: quote.tradie_id, jobId: quote.job_id, quoteId, clientId: user.id, jobTitle, siteVisitDate, feePaid: false,
        });
      } catch (e) {
        console.warn("book-site-visit: notify failed", e);
      }
      return jsonOk({ success: true, quoteId, status: "site_visit_scheduled", feeCharged: false });
    }

    // ── Paid call-out fee: collect via Checkout, routed to the tradie ──
    if (!stripeSecretKey) return errorJson("Stripe not configured", 500);

    // The tradie must have a completed Connect account to receive the fee.
    const { data: tradieConnect } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", quote.tradie_id)
      .maybeSingle();
    const destinationAccount = tradieConnect?.stripe_connect_onboarding_complete
      ? tradieConnect.stripe_connect_account_id
      : null;
    if (!destinationAccount) {
      return errorJson(
        "This tradie hasn't finished setting up payments yet, so the visit can't be booked. Please ask them to complete their payment setup.",
        409,
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Client Stripe customer (reuse if they have one)
    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (existingSub?.stripe_customer_id) customerId = existingSub.stripe_customer_id;

    const { data: clientProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const processingFeeCents = calculateProcessingFeeCents(feeCents);
    // Prefer the caller's actual origin (works for localhost dev on any port and
    // for production) over the SITE_URL env, which is easy to misconfigure.
    const origin = req.headers.get("Origin");
    const siteUrl = origin || Deno.env.get("SITE_URL") || "https://connectradie.com";

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `Site visit call-out fee — ${jobTitle}`,
            description: "Credited to your final bill if you proceed with this tradie.",
          },
          unit_amount: feeCents,
        },
        quantity: 1,
      },
    ];
    if (processingFeeCents > 0) {
      lineItems.push({
        price_data: { currency: "aud", product_data: { name: "Secure Processing Fee" }, unit_amount: processingFeeCents },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : clientProfile?.email,
      mode: "payment",
      line_items: lineItems,
      // Route the call-out fee straight to the tradie; platform keeps only the
      // processing fee (covers Stripe). No on_behalf_of (au_becs/card capability).
      payment_intent_data: {
        application_fee_amount: processingFeeCents,
        transfer_data: { destination: destinationAccount },
        // Mirror the identifying metadata onto the PaymentIntent so the webhook can
        // settle the quote from either checkout.session.completed OR
        // payment_intent.succeeded — whichever Stripe delivers first.
        metadata: {
          type: "site_visit_fee",
          quote_id: quoteId,
          job_id: quote.job_id,
          client_id: user.id,
          tradie_id: quote.tradie_id,
          call_out_fee_cents: String(feeCents),
          visit_start: visitStart ?? "",
          visit_end: visitEnd ?? "",
          time_confirmed: timeConfirmed ? "true" : "false",
        },
      },
      metadata: {
        type: "site_visit_fee",
        quote_id: quoteId,
        job_id: quote.job_id,
        client_id: user.id,
        tradie_id: quote.tradie_id,
        call_out_fee_cents: String(feeCents),
        suggested_date: siteVisitDate ?? "",
        visit_start: visitStart ?? "",
        visit_end: visitEnd ?? "",
        time_confirmed: timeConfirmed ? "true" : "false",
      },
      success_url: `${siteUrl}/payment-success`,
      cancel_url: `${siteUrl}/my-jobs?visit_cancelled=true`,
    });

    return jsonOk({ success: true, checkoutUrl: session.url, feeCharged: true });
  } catch (err) {
    console.error("Error in book-site-visit:", err);
    return errorJson("An internal error occurred", 500);
  }
});
