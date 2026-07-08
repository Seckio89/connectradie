import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  public-quote — token-gated public access to a quote sent to an OFF-APP client.

  The client isn't a ConnecTradie user, so there's no JWT. Access is via the
  unguessable quotes.public_token generated when the tradie emails the quote.
  Deploy WITHOUT JWT verification:
    supabase functions deploy public-quote --no-verify-jwt

  POST body:
    { "token": "<uuid>", "action": "view" | "accept" }
  Only safe, client-facing fields are returned — no internal ids or CRM PII.
*/

// This endpoint is intentionally PUBLIC — an off-app client opens their quote
// link from any browser, so the origin isn't the security boundary (the
// unguessable token is). Allow any origin; no credentials are used.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    let payload: { token?: string; action?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const action = payload.action === "accept" ? "accept" : "view";
    if (!UUID_RE.test(token)) return json({ error: "Invalid quote link" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, job_id, tradie_id, price_min, price_max, firm_price, message, status, accepted_at, proposed_start_date")
      .eq("public_token", token)
      .maybeSingle();

    if (error || !quote) return json({ error: "This quote link is not valid or has expired." }, 404);

    const { data: job } = await supabase
      .from("jobs")
      .select("id, title, description, location_address, status")
      .eq("id", quote.job_id)
      .maybeSingle();

    const { data: tradie } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", quote.tradie_id)
      .maybeSingle();

    const { data: td } = await supabase
      .from("tradie_details")
      .select("business_name")
      .eq("profile_id", quote.tradie_id)
      .maybeSingle();

    if (action === "accept") {
      // Idempotent: accepting an already-accepted quote is a no-op success.
      if (quote.status !== "accepted") {
        const nowIso = new Date().toISOString();
        await supabase
          .from("quotes")
          .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
          .eq("id", quote.id);
        await supabase
          .from("jobs")
          .update({ status: "accepted", tradie_id: quote.tradie_id })
          .eq("id", quote.job_id);

        // Notify the tradie in-app that the client accepted.
        await supabase.from("notifications").insert({
          user_id: quote.tradie_id,
          type: "quote_accepted",
          title: "Quote accepted",
          message: `Your quote for ${job?.title || "the job"} was accepted.`,
          job_id: quote.job_id,
          read: false,
        });
      }
    }

    const finalStatus = action === "accept" ? "accepted" : quote.status;

    return json({
      status: finalStatus,
      quote: {
        priceMin: quote.price_min,
        priceMax: quote.price_max,
        firmPrice: quote.firm_price,
        message: quote.message,
        proposedStartDate: quote.proposed_start_date,
      },
      job: {
        title: job?.title ?? null,
        description: job?.description ?? null,
        address: job?.location_address ?? null,
      },
      tradie: {
        name: tradie?.full_name ?? null,
        business: td?.business_name ?? null,
      },
    });
  } catch (err) {
    console.error("public-quote error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
