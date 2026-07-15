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
      .select("id, title, description, location_address, status, client_contact_id")
      .eq("id", quote.job_id)
      .maybeSingle();

    const { data: tradie } = await supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
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

        // Who accepted + for how much, so the tradie's alert actually says something.
        const money = (n: number) => `$${Number(n).toLocaleString("en-AU")}`;
        const priceStr =
          quote.firm_price != null
            ? money(quote.firm_price)
            : quote.price_min != null && quote.price_max != null
              ? (quote.price_min === quote.price_max ? money(quote.price_min) : `${money(quote.price_min)} – ${money(quote.price_max)}`)
              : quote.price_min != null ? money(quote.price_min) : "";

        let clientFirst = "Your client";
        if (job?.client_contact_id) {
          const { data: contact } = await supabase
            .from("client_contacts")
            .select("full_name")
            .eq("id", job.client_contact_id)
            .maybeSingle();
          if (contact?.full_name) clientFirst = contact.full_name.split(" ")[0];
        }

        const jobTitle = job?.title || "the job";

        // In-app notification for the tradie.
        await supabase.from("notifications").insert({
          user_id: quote.tradie_id,
          type: "quote_accepted",
          title: "Quote accepted",
          message: `${clientFirst} accepted your quote${priceStr ? ` of ${priceStr}` : ""} for ${jobTitle}.`,
          job_id: quote.job_id,
          read: false,
        });

        // Email the tradie too — they may not be in the app when the client accepts.
        if (tradie?.email) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                to: tradie.email,
                subject: `Quote accepted — ${jobTitle}`,
                body: `Good news — ${clientFirst} accepted your quote${priceStr ? ` of ${priceStr}` : ""} for "${jobTitle}". The job is now in your ConnecTradie dashboard. Reach out to them to arrange the work.`,
                notificationType: "QUOTE_ACCEPTED",
                metadata: { amount: priceStr, link: "https://connectradie.com/work" },
              }),
            });
          } catch (e) {
            console.error("Failed to send quote-accepted email:", e);
          }
        }
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
        avatarUrl: tradie?.avatar_url ?? null,
      },
    });
  } catch (err) {
    console.error("public-quote error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
