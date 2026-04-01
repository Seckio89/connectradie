import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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

    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return errorJson("Unauthorized", 401);
    }

    const { recurringJobId } = await req.json();
    if (!recurringJobId) {
      return errorJson("Missing recurringJobId", 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the saved payment method
    const { data: saved, error: fetchError } = await supabase
      .from("saved_payment_methods")
      .select("id, client_id, stripe_payment_method_id, recurring_job_id")
      .eq("recurring_job_id", recurringJobId)
      .maybeSingle();

    if (fetchError || !saved) {
      return errorJson("No saved payment method found for this service", 404);
    }

    if (saved.client_id !== user.id) {
      return errorJson("You are not the client on this service", 403);
    }

    // Detach payment method from Stripe
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    try {
      await stripe.paymentMethods.detach(saved.stripe_payment_method_id);
    } catch (stripeErr) {
      console.error("Failed to detach payment method:", stripeErr);
      // Continue with DB cleanup even if Stripe detach fails
    }

    // Delete from database
    await supabase
      .from("saved_payment_methods")
      .delete()
      .eq("id", saved.id);

    // Reset recurring job preference to card
    await supabase
      .from("recurring_jobs")
      .update({ preferred_payment_method: "card" })
      .eq("id", recurringJobId);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("remove-becs-payment error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
