import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Server configuration error", 500);
    }

    if (!stripeSecretKey) {
      return errorResponse("Stripe not configured", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    const authClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return errorResponse(authError?.message || "Unauthorized", 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const { returnUrl } = body as { returnUrl?: string };

    if (!returnUrl) {
      return errorResponse("Missing returnUrl parameter", 400);
    }

    if (!isValidRedirectUrl(returnUrl)) {
      return errorResponse("Invalid redirect URL", 400);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch profile to check for existing session
    const { data: profile } = await adminClient
      .from("profiles")
      .select("stripe_identity_session_id, is_identity_verified")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return errorResponse("Profile not found", 404);
    }

    // Already verified — no need for another session
    if (profile.is_identity_verified) {
      return errorResponse("Identity already verified", 400);
    }

    // Check if there's an existing session we can reuse
    let sessionUrl: string | null = null;

    if (profile.stripe_identity_session_id) {
      try {
        const existing = await stripe.identity.verificationSessions.retrieve(
          profile.stripe_identity_session_id
        );
        // Reuse if still open (not expired/cancelled/verified)
        if (existing.status === "requires_input") {
          sessionUrl = existing.url;
        }
      } catch {
        // Session not found or expired — create a new one
      }
    }

    if (!sessionUrl) {
      // Create a new Stripe Identity VerificationSession
      const session = await stripe.identity.verificationSessions.create({
        type: "document",
        metadata: { user_id: user.id },
        options: {
          document: {
            allowed_types: ["driving_license", "passport"],
          },
        },
        return_url: returnUrl,
      });

      // Save session ID to profile
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ stripe_identity_session_id: session.id })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error saving identity session ID:", updateError);
        return errorResponse("Failed to save session", 500);
      }

      sessionUrl = session.url;
    }

    if (!sessionUrl) {
      return errorResponse("Failed to get verification URL", 500);
    }

    return new Response(JSON.stringify({ url: sessionUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating identity verification session:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
