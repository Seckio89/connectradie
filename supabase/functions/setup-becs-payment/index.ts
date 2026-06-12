import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      return errorJson("Server configuration error", 500);
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return errorJson("Unauthorized", 401);
    }

    const { allowed } = checkRateLimit(`${user.id}-setup-becs-payment`, 5, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { recurringJobId } = await req.json();
    if (!recurringJobId) {
      return errorJson("Missing recurringJobId", 400);
    }

    // Verify the client owns this recurring job
    const { data: job, error: jobError } = await supabase
      .from("recurring_jobs")
      .select("id, client_id, tradie_id")
      .eq("id", recurringJobId)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Recurring job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson("You are not the client on this recurring job", 403);
    }

    // Check if a saved method already exists
    const { data: existing } = await supabase
      .from("saved_payment_methods")
      .select("id")
      .eq("recurring_job_id", recurringJobId)
      .eq("mandate_status", "active")
      .maybeSingle();

    if (existing) {
      return errorJson("A saved payment method already exists for this service. Remove it first to set up a new one.", 409);
    }

    // Ensure Stripe customer exists
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    let customerId: string | null = null;

    // Check stripe_subscriptions first (most reliable)
    const { data: sub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (sub?.stripe_customer_id) {
      customerId = sub.stripe_customer_id;
    }

    // Check profiles table
    if (!customerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id, email, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
      } else if (profile?.email) {
        // Create a new Stripe customer
        const customer = await stripe.customers.create({
          email: profile.email,
          name: profile.full_name || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;

        // Save to profiles
        await supabase
          .from("profiles")
          .update({ stripe_customer_id: customer.id })
          .eq("id", user.id);
      }
    }

    if (!customerId) {
      return errorJson("Could not resolve Stripe customer", 500);
    }

    // Create SetupIntent for BECS Direct Debit
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["au_becs_debit"],
      metadata: {
        recurring_job_id: recurringJobId,
        client_id: user.id,
        tradie_id: job.tradie_id || "",
      },
    });

    return jsonResponse({
      clientSecret: setupIntent.client_secret,
      customerId,
    });
  } catch (err) {
    console.error("setup-becs-payment error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
