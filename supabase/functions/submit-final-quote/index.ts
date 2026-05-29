import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  submit-final-quote — stage 3 of the 3-stage quote flow.

  Called by the TRADIE to submit a binding final quote with a validity period.
  Two valid entry paths (see docs/three-stage-quote-flow.md):

    T9 (normal path): site_visit_completed -> final_submitted
    T2 (fast path) : pending -> final_submitted, when the original estimate
                     had requires_site_inspection = false

  In both cases the row is moved into final_submitted with final_price,
  final_valid_until, and final_submitted_at populated. No money moves —
  the escrow only lands when the CLIENT later accepts via accept-and-pay.

  ACL anti-misleading (state machine §5.5):
    A final_price up to 25% above price_max is allowed without comment.
    Above that, we log an advisory + surface it in the client notification
    metadata. The decision to accept or decline still sits with the client.
    The UI prompts the tradie to use their `message` field to explain.

  Auth & ownership: caller must be quote.tradie_id
  Flow gate       : jobs.flow_version must be 2
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_VALIDITY_DAYS = 14;
const PRICE_ADVISORY_FACTOR = 1.25;

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidIsoDate(s: string): boolean {
  // Accepts YYYY-MM-DD only — that's the column type (date).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

    const { quoteId, finalPrice, finalValidUntil, message } = body as {
      quoteId?: string;
      finalPrice?: number;
      finalValidUntil?: string;
      message?: string;
    };

    if (!quoteId) return errorJson("Missing required parameter: quoteId", 400);
    if (typeof finalPrice !== "number" || !Number.isFinite(finalPrice) || finalPrice <= 0) {
      return errorJson("finalPrice must be a positive number", 400);
    }

    const today = todayUtcDateString();
    let validUntil: string;
    if (finalValidUntil) {
      if (!isValidIsoDate(finalValidUntil)) {
        return errorJson("finalValidUntil must be a YYYY-MM-DD date", 400);
      }
      if (finalValidUntil < today) {
        return errorJson("finalValidUntil cannot be in the past", 400);
      }
      validUntil = finalValidUntil;
    } else {
      validUntil = addDays(today, DEFAULT_VALIDITY_DAYS);
    }

    // 1. Look up the quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        "id, job_id, tradie_id, status, requires_site_inspection, price_min, price_max, site_visit_completed_at",
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) return errorJson("Quote not found", 404);

    if (quote.tradie_id !== user.id) {
      return errorJson("Only the tradie on this quote can submit a final quote", 403);
    }

    // 2. Determine which entry path is valid
    const isFastPath = quote.status === "pending" && !quote.requires_site_inspection;
    const isNormalPath = quote.status === "site_visit_completed";

    if (!isFastPath && !isNormalPath) {
      return errorJson(
        `Cannot submit a final quote from status '${quote.status}'. The site visit must be completed first (or the quote must be marked as not requiring a site visit).`,
        409,
      );
    }

    if (isNormalPath && !quote.site_visit_completed_at) {
      return errorJson(
        "This quote is in 'site_visit_completed' status but has no completion timestamp. Contact support.",
        409,
      );
    }

    // 3. Look up the job (flow_version gate + notification context)
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, title, description, flow_version")
      .eq("id", quote.job_id)
      .maybeSingle();

    if (jobError || !job) return errorJson("Job not found", 404);
    if (job.flow_version !== 2) {
      return errorJson(
        "This job is on the legacy single-step quote flow. submit-final-quote is only valid on the 3-stage flow.",
        400,
      );
    }

    // 4. ACL anti-misleading advisory (state machine §5.5)
    // Not blocking — the client decides. We surface this in the notification
    // metadata and log it server-side for any future audit.
    const advisoryThreshold = Number(quote.price_max) * PRICE_ADVISORY_FACTOR;
    const priceExceedsAdvisory = finalPrice > advisoryThreshold;
    if (priceExceedsAdvisory) {
      console.info(
        `submit-final-quote: ACL advisory — quote ${quoteId} final $${finalPrice} > 125% of price_max $${quote.price_max}. Path: ${isFastPath ? "fast" : "normal"}.`,
      );
    }

    // 5. Build the update. message is optional but recommended when the price
    // is significantly above the estimate range — UI should require it.
    const updates: Record<string, unknown> = {
      status: "final_submitted",
      final_price: finalPrice,
      final_valid_until: validUntil,
      final_submitted_at: new Date().toISOString(),
    };
    if (typeof message === "string" && message.trim().length > 0) {
      updates.message = message.trim().slice(0, 2000);
    }

    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update(updates)
      .eq("id", quoteId);

    if (quoteUpdateError) {
      console.error("submit-final-quote: failed to update quote", quoteUpdateError);
      return errorJson("Failed to submit final quote", 500);
    }

    // 6. Notify the client
    try {
      const { data: tradieProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const tradieName = tradieProfile?.full_name || "A tradie";
      const jobTitle = job.title
        || job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ")
        || "your job";

      const advisoryLine = priceExceedsAdvisory
        ? ` Note: this is more than 25% above the original estimate range ($${quote.price_min}–$${quote.price_max}). The tradie's message should explain why.`
        : "";

      await supabase.from("notifications").insert({
        user_id: job.client_id,
        type: "final_quote_submitted",
        title: "Final quote received",
        message: `${tradieName} has submitted their final quote for ${jobTitle}: $${finalPrice.toFixed(2)}. Valid until ${validUntil}.${advisoryLine}`,
        job_id: quote.job_id,
        metadata: {
          quote_id: quoteId,
          tradie_id: user.id,
          final_price: finalPrice,
          final_valid_until: validUntil,
          original_price_min: Number(quote.price_min),
          original_price_max: Number(quote.price_max),
          price_exceeds_advisory: priceExceedsAdvisory,
          path: isFastPath ? "fast" : "normal",
        },
        read: false,
      });
    } catch (notifyErr) {
      console.warn("submit-final-quote: notify failed", notifyErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        quoteId,
        status: "final_submitted",
        finalPrice,
        finalValidUntil: validUntil,
        priceExceedsAdvisory,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in submit-final-quote:", err);
    return errorJson("An internal error occurred", 500);
  }
});
