import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

/*
  complete-site-visit — stage 2 → 3 transition in the 3-stage quote flow.

  Called by the TRADIE after they've completed the on-site inspection. Flips
  the quote into 'site_visit_completed', which gates the submit-final-quote
  step. No money moves.

  Spec: docs/three-stage-quote-flow.md, transition T5.

  Status transition: quotes.status: site_visit_scheduled -> site_visit_completed
  Auth & ownership:  caller must be quote.tradie_id
  Flow gate:         jobs.flow_version must be 2
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

    const { allowed } = checkRateLimit(`${user.id}-complete-site-visit`, 10, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorJson("Invalid JSON body", 400);
    }

    const { quoteId, notes } = body as { quoteId?: string; notes?: string };
    if (!quoteId) return errorJson("Missing required parameter: quoteId", 400);

    // 1. Look up the quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, job_id, tradie_id, status, site_visit_scheduled_at")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) return errorJson("Quote not found", 404);

    // 2. Ownership: only the tradie on the quote can mark it complete
    if (quote.tradie_id !== user.id) {
      return errorJson("Only the tradie on this quote can mark the site visit complete", 403);
    }

    if (quote.status !== "site_visit_scheduled") {
      return errorJson(`Cannot complete site visit from status '${quote.status}'`, 409);
    }

    // Defensive: site_visit_scheduled_at should be set. If it isn't, the row is
    // in a weird state — refuse rather than silently set both timestamps.
    if (!quote.site_visit_scheduled_at) {
      return errorJson(
        "This quote is in 'site_visit_scheduled' status but has no scheduled timestamp. Contact support.",
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
        "This job is on the legacy single-step quote flow. complete-site-visit is only valid on the 3-stage flow.",
        400,
      );
    }

    // 4. Flip the quote
    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({
        status: "site_visit_completed",
        site_visit_completed_at: new Date().toISOString(),
      })
      .eq("id", quoteId);

    if (quoteUpdateError) {
      console.error("complete-site-visit: failed to update quote", quoteUpdateError);
      return errorJson("Failed to mark site visit complete", 500);
    }

    // 5. Notify the client
    try {
      const { data: tradieProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const tradieName = tradieProfile?.full_name || "The tradie";
      const jobTitle = job.title
        || job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ")
        || "your job";
      const notesLine = notes && notes.trim().length > 0
        ? ` Notes from the visit: ${notes.trim().slice(0, 200)}`
        : "";

      await supabase.from("notifications").insert({
        user_id: job.client_id,
        type: "site_visit_completed",
        title: "Site visit completed",
        message: `${tradieName} has completed the site visit for ${jobTitle}. Their final quote will follow.${notesLine}`,
        job_id: quote.job_id,
        metadata: {
          quote_id: quoteId,
          tradie_id: user.id,
          notes: notes ?? null,
        },
        read: false,
      });
    } catch (notifyErr) {
      // Non-critical — quote is already updated
      console.warn("complete-site-visit: notify failed", notifyErr);
    }

    return new Response(
      JSON.stringify({ success: true, quoteId, status: "site_visit_completed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error in complete-site-visit:", err);
    return errorJson("An internal error occurred", 500);
  }
});
