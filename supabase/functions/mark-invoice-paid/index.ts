import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  mark-invoice-paid — a tradie confirms an EXTERNAL invoice was paid off-platform
  (bank transfer / cash / cheque / accountant remittance).

  recurring_invoices is service-role-only for writes (RLS), so this runs with the
  service key after verifying the caller owns the invoice. Only invoices with
  payment_method = 'external' can be marked this way — Stripe ones are marked paid
  by the webhook. No money moves here; it's a bookkeeping flag.

  Browser-called (token-gated), deploy WITHOUT gateway JWT:
    supabase functions deploy mark-invoice-paid --no-verify-jwt
*/

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

const METHODS = ["bank_transfer", "cash", "cheque", "accountant"] as const;

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: { invoiceId?: string; method?: string; receivedDate?: string; reference?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const { invoiceId, method, receivedDate, reference } = body;
    if (!invoiceId) return json({ error: "Missing invoiceId" }, 400);
    if (!method || !METHODS.includes(method as typeof METHODS[number])) {
      return json({ error: "Choose how the payment was received." }, 400);
    }

    // Received date → timestamp. Default to now if missing/invalid.
    let paidAtIso = new Date().toISOString();
    if (receivedDate && /^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
      const d = new Date(`${receivedDate}T00:00:00Z`);
      if (!isNaN(d.getTime())) paidAtIso = d.toISOString();
    }

    const { data: invoice } = await supabase
      .from("recurring_invoices")
      .select("id, tradie_id, status, payment_method")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!invoice) return json({ error: "Invoice not found" }, 404);
    if (invoice.tradie_id !== user.id) return json({ error: "Not your invoice" }, 403);
    if (invoice.payment_method !== "external") {
      return json({ error: "Only manually-paid (external) invoices can be marked paid here." }, 400);
    }
    if (invoice.status === "paid") return json({ error: "This invoice is already marked paid." }, 400);

    const { error: updateErr } = await supabase
      .from("recurring_invoices")
      .update({
        status: "paid",
        paid_at: paidAtIso,
        external_payment_method: method,
        external_reference: (reference || "").trim() || null,
        marked_paid_by: user.id,
      })
      .eq("id", invoiceId);
    if (updateErr) { console.error("mark-invoice-paid update failed", updateErr); return json({ error: "Could not update the invoice" }, 500); }

    return json({ success: true });
  } catch (err) {
    console.error("mark-invoice-paid error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
