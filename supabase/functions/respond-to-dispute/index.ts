import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return errorJson("Unauthorized", 401);
    }

    const { allowed } = checkRateLimit(`${user.id}-respond-to-dispute`, 10, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invoiceId, action, response } = await req.json();
    if (!invoiceId) {
      return errorJson("Missing invoiceId", 400);
    }
    if (!action || !["respond", "accept_response", "escalate"].includes(action)) {
      return errorJson("Invalid action — must be 'respond', 'accept_response', or 'escalate'", 400);
    }

    // Fetch the invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("recurring_invoices")
      .select("*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(tradie_id, client_id, trade_category)")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return errorJson("Invoice not found", 404);
    }

    if (invoice.status !== "disputed") {
      return errorJson(`Invoice is '${invoice.status}', not disputed`, 400);
    }

    const now = new Date().toISOString();
    const tradieId = invoice.recurring_job?.tradie_id;
    const tradeLabel = (invoice.recurring_job?.trade_category || "service")
      .replace(/_/g, " ");

    // ─── TRADIE RESPONDS ───
    if (action === "respond") {
      if (tradieId !== user.id) {
        return errorJson("Only the tradie can respond to this dispute", 403);
      }
      if (!response?.trim()) {
        return errorJson("Missing response text", 400);
      }

      await supabase
        .from("recurring_invoices")
        .update({
          tradie_response: response.trim(),
          tradie_responded_at: now,
          updated_at: now,
        })
        .eq("id", invoiceId);

      // Notify client
      await supabase.from("notifications").insert({
        user_id: invoice.homeowner_id,
        type: "dispute_response",
        title: "Tradie Responded to Dispute",
        message: `Your tradie has responded to the disputed ${tradeLabel} invoice. Please review their response.`,
        metadata: { invoice_id: invoiceId },
        read: false,
      });

      return jsonResponse({ status: "responded" });
    }

    // ─── CLIENT ACCEPTS RESPONSE (re-approve) ───
    if (action === "accept_response") {
      if (invoice.homeowner_id !== user.id) {
        return errorJson("Only the client can accept the response", 403);
      }

      // Move back to pending_approval so client can use normal approve flow
      await supabase
        .from("recurring_invoices")
        .update({
          status: "pending_approval",
          resolved_at: now,
          resolved_by: user.id,
          resolution_note: "Client accepted tradie response",
          updated_at: now,
        })
        .eq("id", invoiceId);

      // Notify tradie
      if (tradieId) {
        await supabase.from("notifications").insert({
          user_id: tradieId,
          type: "dispute_resolved",
          title: "Dispute Resolved",
          message: `Your client accepted your response for the ${tradeLabel} invoice dispute. The invoice is ready for approval.`,
          metadata: { invoice_id: invoiceId },
          read: false,
        });
      }

      return jsonResponse({ status: "accepted" });
    }

    // ─── CLIENT ESCALATES TO ADMIN ───
    if (action === "escalate") {
      if (invoice.homeowner_id !== user.id) {
        return errorJson("Only the client can escalate", 403);
      }

      await supabase
        .from("recurring_invoices")
        .update({
          escalated_at: now,
          updated_at: now,
        })
        .eq("id", invoiceId);

      // Notify all admins
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        const adminNotifications = admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          type: "dispute_escalated",
          title: "Invoice Dispute Escalated",
          message: `A client has escalated a ${tradeLabel} invoice dispute ($${Number(invoice.total).toFixed(2)}). Please review.`,
          metadata: { invoice_id: invoiceId },
          read: false,
        }));
        await supabase.from("notifications").insert(adminNotifications);
      }

      // Notify tradie
      if (tradieId) {
        await supabase.from("notifications").insert({
          user_id: tradieId,
          type: "dispute_escalated",
          title: "Dispute Escalated to Admin",
          message: `The dispute on your ${tradeLabel} invoice has been escalated to admin for review.`,
          metadata: { invoice_id: invoiceId },
          read: false,
        });
      }

      return jsonResponse({ status: "escalated" });
    }

    return errorJson("Unhandled action", 400);
  } catch (err) {
    console.error("respond-to-dispute error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
