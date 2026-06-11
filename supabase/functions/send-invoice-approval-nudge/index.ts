import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/*
  send-invoice-approval-nudge — fires a fresh in-app notification + email to a
  client whose pending_approval recurring invoice has been sitting too long.
  Designed to be hand-invoked (or wired to a CTA in the tradie's UI later).
  Auth: verify_jwt=true at gateway, plus a JWT-prefix sanity check.
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !resendKey) {
      return errorJson("Server configuration error", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { invoice_id } = await req.json() as { invoice_id?: string };
    if (!invoice_id) return errorJson("Missing invoice_id", 400);

    const { data: invoice, error: invErr } = await supabase
      .from("recurring_invoices")
      .select("id, status, total, billing_period_start, billing_period_end, regular_sessions_count, homeowner_id, recurring_job_id")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr || !invoice) return errorJson("Invoice not found", 404);
    if (invoice.status !== "pending_approval") {
      return errorJson(`Invoice is in status '${invoice.status}', nothing to nudge`, 400);
    }

    const { data: client } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", invoice.homeowner_id)
      .maybeSingle();

    if (!client?.email) return errorJson("Client has no email on file", 400);

    const totalFormatted = Number(invoice.total).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
    const periodLabel = `${invoice.billing_period_start} to ${invoice.billing_period_end}`;
    const siteUrl = Deno.env.get("SITE_URL") || "https://connectradie.com";
    const approvalLink = `${siteUrl}/payments?invoice=${invoice.id}`;

    // 1. Insert a fresh in-app notification (the original may have been read or
    // missed). Same type as the original so it surfaces in the same bell list.
    await supabase.from("notifications").insert({
      user_id: invoice.homeowner_id,
      type: "invoice_approval_required",
      title: "Reminder: Invoice ready for approval",
      message: `Your tradie is waiting on you — ${totalFormatted} for ${invoice.regular_sessions_count} sessions (${periodLabel}). Tap to review and approve.`,
      metadata: {
        invoice_id: invoice.id,
        recurring_job_id: invoice.recurring_job_id,
        total: invoice.total,
        link: approvalLink,
        manual_nudge: true,
      },
      read: false,
    });

    // 2. Send email via Resend directly so we don't need a user JWT.
    const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "notifications@connectradie.com";
    const subject = `Reminder: ${totalFormatted} invoice waiting for your approval`;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#06D6A0;padding:24px 32px;"><h1 style="margin:0;color:#fff;font-size:20px;">ConnecTradie</h1></td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">Hi ${(client.full_name || "there").split(" ")[0]},</h2>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Your weekly Office Clean invoice is ready and waiting on your approval before payment can be processed.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f9fafb;border-radius:8px;width:100%;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Total</p>
              <p style="margin:0 0 12px;color:#111827;font-size:24px;font-weight:700;">${totalFormatted}</p>
              <p style="margin:0;color:#6b7280;font-size:13px;">${invoice.regular_sessions_count} sessions · ${periodLabel}</p>
            </td></tr>
          </table>
          <a href="${approvalLink}" style="display:inline-block;background:#06D6A0;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Review and approve</a>
          <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
            Once approved, payment is processed via Stripe automatically. If anything looks off, you can dispute the invoice from the same screen.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: client.email,
        subject,
        html,
      }),
    });

    const resendBody = await resendResp.json().catch(() => ({}));
    if (!resendResp.ok) {
      console.error("[invoice-nudge] Resend failed:", resendResp.status, resendBody);
      return jsonResponse({
        notification_inserted: true,
        email_sent: false,
        email_error: resendBody,
        email_status: resendResp.status,
      }, 200);
    }

    return jsonResponse({
      notification_inserted: true,
      email_sent: true,
      email_id: resendBody.id ?? null,
      to: client.email,
    });
  } catch (err) {
    console.error("[invoice-nudge] Fatal:", err);
    return errorJson(err instanceof Error ? err.message : "Internal error", 500);
  }
});
