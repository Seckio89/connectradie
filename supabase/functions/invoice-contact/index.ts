import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier } from "../_shared/pricing.ts";

/*
  invoice-contact — bill an OFF-APP client_contact for a recurring service.

  Two modes, chosen by the contact's payment_method:
   • stripe   → hosted Stripe Checkout (destination charge to the tradie's Connect
                account, escrow-protected). Contact gets an emailed pay link.
   • external → record-only invoice (no Stripe). The tradie is paid off-platform
                (bank transfer / cash) and marks it paid via mark-invoice-paid.
                Contact gets an emailed tax invoice with the tradie's bank details.

  Both record a recurring_invoices row against client_contact_id. The existing
  stripe-webhook marks the STRIPE ones paid by stripe_checkout_session_id.

  Browser-called (token-gated), deploy WITHOUT gateway JWT:
    supabase functions deploy invoice-contact --no-verify-jwt
*/

// CORS: same allow-list pattern as the rest of the fleet — echo the request
// origin only when it's the prod domain (ALLOWED_ORIGIN) or a localhost dev
// server, else fall back to the prod domain. Not a wildcard.
const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173", // Vite dev server
  "http://localhost:4173", // Vite preview
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

const fmtAud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey || !stripeSecretKey) return json({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: { recurringJobId?: string; sessionsCount?: number; note?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const { recurringJobId, sessionsCount, note } = body;
    if (!recurringJobId) return json({ error: "Missing recurringJobId" }, 400);
    const count = Math.max(1, Math.min(Number(sessionsCount) || 1, 60));

    // 1. The off-app recurring service.
    const { data: job } = await supabase
      .from("recurring_jobs")
      .select("id, client_contact_id, tradie_id, agreed_price, trade_category, cancelled_at")
      .eq("id", recurringJobId)
      .maybeSingle();
    if (!job) return json({ error: "Service not found" }, 404);
    if (user.id !== job.tradie_id) return json({ error: "Not your service" }, 403);
    if (job.cancelled_at) return json({ error: "Service is cancelled" }, 400);
    if (!job.client_contact_id) return json({ error: "This is an on-app service — use the standard invoice flow" }, 400);

    const perVisit = Number(job.agreed_price) || 0;
    const total = perVisit * count;
    if (total <= 0) return json({ error: "This service has no agreed price — set one first" }, 400);
    const totalCents = Math.round(total * 100);

    // 2. The off-app client + how they pay.
    const { data: contact } = await supabase
      .from("client_contacts")
      .select("full_name, email, payment_method")
      .eq("id", job.client_contact_id)
      .maybeSingle();
    if (!contact) return json({ error: "Client not found" }, 404);
    const isExternal = (contact.payment_method || "external") === "external";
    // A Stripe pay-link needs an email to send to. External (record-only) invoices
    // can be generated without one — the tradie may just want it for their records.
    if (!isExternal && !contact.email) {
      return json({ error: "This client has no email on file — add one to send an invoice" }, 400);
    }

    // 3. The tradie (business identity + Connect + bank details for external).
    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete, full_name, abn_number, is_gst_registered, bank_name, bank_bsb, bank_account_number, bank_account_name")
      .eq("id", job.tradie_id)
      .maybeSingle();
    const { data: tradieDetails } = await supabase
      .from("tradie_details")
      .select("subscription_tier, business_name")
      .eq("profile_id", job.tradie_id)
      .maybeSingle();

    const tradeLabel = String(job.trade_category || "Service").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const businessName = tradieDetails?.business_name || tradieProfile?.full_name || undefined;
    const today = new Date().toISOString().split("T")[0];
    const due = new Date(); due.setDate(due.getDate() + 7);
    const dueStr = due.toISOString().split("T")[0];
    const amountStr = fmtAud(total);
    const firstName = (contact.full_name || "there").split(" ")[0];

    // ─── EXTERNAL (manual / bank-transfer) — record-only, no Stripe ─────────────
    if (isExternal) {
      const { data: invoice, error: insertErr } = await supabase
        .from("recurring_invoices")
        .insert({
          recurring_job_id: recurringJobId,
          client_contact_id: job.client_contact_id,
          homeowner_id: null,
          tradie_id: job.tradie_id,
          billing_period_start: today,
          billing_period_end: today,
          regular_sessions_count: count,
          subtotal: total,
          total,
          status: "sent",
          payment_method: "external",
          due_date: dueStr,
        })
        .select("id")
        .single();
      if (insertErr) { console.error("invoice-contact external insert failed", insertErr); return json({ error: "Failed to record the invoice" }, 500); }

      await supabase.from("recurring_jobs").update({ last_invoiced_at: today }).eq("id", recurringJobId);

      const reference = `INV-${String(invoice.id).slice(0, 8).toUpperCase()}`;
      let emailed = false;
      if (contact.email) {
        const gstNote = tradieProfile?.is_gst_registered
          ? `Total includes GST of ${fmtAud(total / 11)}`
          : "";
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              to: contact.email,
              subject: `Invoice from ${businessName || "your tradie"} — ${amountStr}`,
              body: `Hi ${firstName}, here's your invoice for ${tradeLabel}${count > 1 ? ` (${count} visits)` : ""}${note ? `. ${note}` : ""}. Please pay by bank transfer using the details below.`,
              notificationType: "INVOICE_EXTERNAL",
              metadata: {
                amount: amountStr,
                service: tradeLabel,
                businessName,
                abn: tradieProfile?.abn_number || undefined,
                gstNote,
                bankName: tradieProfile?.bank_name || undefined,
                bsb: tradieProfile?.bank_bsb || undefined,
                accountName: tradieProfile?.bank_account_name || undefined,
                accountNumber: tradieProfile?.bank_account_number || undefined,
                reference,
                dueDate: fmtDate(dueStr),
              },
            }),
          });
          emailed = true;
        } catch (e) { console.error("invoice-contact: external email failed", e); }
      }

      return json({ invoiceId: invoice.id, total, external: true, emailed, reference });
    }

    // ─── STRIPE (card pay link) ─────────────────────────────────────────────────
    const destinationAccount = tradieProfile?.stripe_connect_onboarding_complete ? tradieProfile.stripe_connect_account_id : null;
    if (!destinationAccount) {
      return json({ error: "Finish your payment setup (Payouts → Stripe) before sending a card invoice." }, 409);
    }

    const tier = resolveTradieTier(tradieDetails?.subscription_tier);
    const platformFeeCents = Math.round(calculatePlatformFee(total, tier) * 100);
    const processingFee = calculateProcessingFeeCents(totalCents);

    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
    const siteUrl = Deno.env.get("SITE_URL") || (allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : "https://connectradie.com");

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: { name: `${tradeLabel}${count > 1 ? ` — ${count} visits` : ""}` },
          unit_amount: totalCents,
        },
        quantity: 1,
      },
    ];
    if (processingFee > 0) {
      lineItems.push({ price_data: { currency: "aud", product_data: { name: "Secure Processing Fee" }, unit_amount: processingFee }, quantity: 1 });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: contact.email!,
      line_items: lineItems,
      mode: "payment",
      success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/payment-cancelled`,
      payment_intent_data: {
        application_fee_amount: platformFeeCents + processingFee,
        transfer_data: { destination: destinationAccount },
      },
      metadata: {
        type: "recurring_invoice",
        routing: "destination",
        recurring_job_id: recurringJobId,
        billing_period_start: today,
        billing_period_end: today,
        homeowner_id: "", // off-app — no client profile (webhook guards on this)
        client_contact_id: job.client_contact_id,
        tradie_id: job.tradie_id ?? "",
        platform_fee: String(platformFeeCents),
        processing_fee: String(processingFee),
        tradie_tier: tier,
      },
    });

    const { data: invoice, error: insertErr } = await supabase
      .from("recurring_invoices")
      .insert({
        recurring_job_id: recurringJobId,
        client_contact_id: job.client_contact_id,
        homeowner_id: null,
        tradie_id: job.tradie_id,
        billing_period_start: today,
        billing_period_end: today,
        regular_sessions_count: count,
        subtotal: total,
        total,
        status: "sent",
        payment_method: "card",
        stripe_checkout_session_id: checkoutSession.id,
        stripe_payment_intent_id: checkoutSession.payment_intent as string | null,
        stripe_payment_url: checkoutSession.url,
        due_date: dueStr,
      })
      .select("id")
      .single();
    if (insertErr) { console.error("invoice-contact insert failed", insertErr); return json({ error: "Failed to record the invoice" }, 500); }

    await supabase.from("recurring_jobs").update({ last_invoiced_at: today }).eq("id", recurringJobId);

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({
          to: contact.email,
          subject: `Invoice for ${tradeLabel} — ${amountStr}`,
          body: `Hi ${firstName}, here's your invoice for ${tradeLabel}${count > 1 ? ` (${count} visits)` : ""}${note ? `. ${note}` : ""}. You can pay securely by card in a few seconds — no account needed.`,
          notificationType: "INVOICE_RECEIVED",
          metadata: {
            amount: amountStr,
            link: checkoutSession.url,
            service: tradeLabel,
            businessName,
          },
        }),
      });
    } catch (e) { console.error("invoice-contact: email failed", e); }

    return json({ invoiceId: invoice.id, total, stripePaymentUrl: checkoutSession.url });
  } catch (err) {
    console.error("invoice-contact error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
