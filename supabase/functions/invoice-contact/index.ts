import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier } from "../_shared/pricing.ts";

/*
  invoice-contact — bill an OFF-APP client_contact.

  RECURRING mode (body.recurringJobId) — bill visits on an ongoing service.
  Two sub-modes, chosen by the contact's payment_method:
   • stripe   → hosted Stripe Checkout (destination charge to the tradie's Connect
                account, escrow-protected). Contact gets an emailed pay link.
   • external → record-only invoice (no Stripe). The tradie is paid off-platform
                (bank transfer / cash) and marks it paid via mark-invoice-paid.
                Contact gets an emailed tax invoice with the tradie's bank details.
  Records a recurring_invoices row; stripe-webhook marks Stripe ones paid by
  stripe_checkout_session_id.

  ONE-OFF mode (body.jobId) — email a payment link for an accepted one-off job.
  Off-app clients have no account, so they can't Accept & Pay in-app; this mints
  a destination-charge Checkout for the accepted quote amount, records a
  payments row (payment_type job_funding), and emails the link. The existing
  stripe-webhook completes the payment and flips the job to in_progress.

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

    let body: { recurringJobId?: string; sessionsCount?: number; note?: string; jobId?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const { recurringJobId, sessionsCount, note, jobId } = body;
    if (!recurringJobId && !jobId) return json({ error: "Missing recurringJobId or jobId" }, 400);
    const count = Math.max(1, Math.min(Number(sessionsCount) || 1, 60));

    // ─── ONE-OFF JOB payment link ────────────────────────────────────────────
    // The off-app client accepted a quote but has no account to Accept & Pay
    // from. Mint a destination-charge Checkout for the accepted amount, record
    // a payments row, and email the link. stripe-webhook (payment_type
    // job_funding) completes the payment and flips the job to in_progress.
    if (jobId && !recurringJobId) {
      const { data: oneOff } = await supabase
        .from("jobs")
        .select("id, title, status, client_contact_id, tradie_id")
        .eq("id", jobId)
        .maybeSingle();
      if (!oneOff) return json({ error: "Job not found" }, 404);
      if (user.id !== oneOff.tradie_id) return json({ error: "Not your job" }, 403);
      if (!oneOff.client_contact_id) {
        return json({ error: "This is an on-app job — the client pays from their own account" }, 400);
      }
      if (!["accepted", "in_progress"].includes(oneOff.status)) {
        return json({ error: "The client needs to accept the quote before you can send a payment link" }, 400);
      }

      // The amount is the accepted quote's price.
      const { data: acceptedQuote } = await supabase
        .from("quotes")
        .select("firm_price, price_min")
        .eq("job_id", oneOff.id)
        .eq("status", "accepted")
        .maybeSingle();
      const jobTotal = Number(acceptedQuote?.firm_price ?? acceptedQuote?.price_min) || 0;
      if (jobTotal <= 0) return json({ error: "No accepted quote with a price on this job" }, 400);
      const jobTotalCents = Math.round(jobTotal * 100);

      const { data: oneOffContact } = await supabase
        .from("client_contacts")
        .select("full_name, email, payment_method")
        .eq("id", oneOff.client_contact_id)
        .maybeSingle();
      if (!oneOffContact) return json({ error: "Client not found" }, 404);
      if ((oneOffContact.payment_method || "external") === "external") {
        return json({ error: "This client pays outside the app — record the payment from Payouts, or switch them to Stripe on their client page" }, 400);
      }
      if (!oneOffContact.email) {
        return json({ error: "This client has no email on file — add one to send a payment link" }, 400);
      }

      const { data: oneOffTradie } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_onboarding_complete, full_name")
        .eq("id", oneOff.tradie_id)
        .maybeSingle();
      const { data: oneOffDetails } = await supabase
        .from("tradie_details")
        .select("subscription_tier, business_name")
        .eq("profile_id", oneOff.tradie_id)
        .maybeSingle();
      const oneOffDestination = oneOffTradie?.stripe_connect_onboarding_complete ? oneOffTradie.stripe_connect_account_id : null;
      if (!oneOffDestination) {
        return json({ error: "Finish your payment setup (Payouts → Stripe) before sending a payment link." }, 409);
      }

      const oneOffTier = resolveTradieTier(oneOffDetails?.subscription_tier);
      const oneOffPlatformFee = Math.round(calculatePlatformFee(jobTotal, oneOffTier) * 100);
      const oneOffProcessingFee = calculateProcessingFeeCents(jobTotalCents);
      const oneOffLabel = (oneOff.title || "Job").trim();
      const oneOffBusiness = oneOffDetails?.business_name || oneOffTradie?.full_name || "your tradie";
      const oneOffFirstName = (oneOffContact.full_name || "there").split(" ")[0];

      const allowedOriginOneOff = Deno.env.get("ALLOWED_ORIGIN") || "";
      const siteUrlOneOff = Deno.env.get("SITE_URL") || (allowedOriginOneOff && allowedOriginOneOff !== "*" ? allowedOriginOneOff : "https://connectradie.com");
      const stripeOneOff = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // ── Reuse an existing unpaid link instead of minting a second one ──
      // Every click used to create a NEW checkout session, so a tradie who
      // double-clicked (or re-sent) left multiple live links for the same job —
      // if the client paid two of them they'd be charged twice. Re-send the
      // still-open session instead; only mint a new one if there isn't one.
      const { data: openPayments } = await supabase
        .from("payments")
        .select("id, stripe_checkout_session_id")
        .eq("job_id", oneOff.id)
        .eq("payment_type", "job_funding")
        .eq("status", "pending")
        .not("stripe_checkout_session_id", "is", null)
        .order("created_at", { ascending: false });

      let reusableUrl: string | null = null;
      for (const row of (openPayments as { id: string; stripe_checkout_session_id: string }[] | null) ?? []) {
        try {
          const existing = await stripeOneOff.checkout.sessions.retrieve(row.stripe_checkout_session_id);
          // 'open' = not paid and not expired; anything else is dead to us.
          if (existing.status === "open" && existing.url && !reusableUrl) {
            reusableUrl = existing.url;
          } else if (existing.status === "expired") {
            // payments.status has no 'expired' value — 'failed' is the terminal
            // state for a link that can never be paid.
            await supabase.from("payments").update({ status: "failed" }).eq("id", row.id);
          }
        } catch (e) {
          console.warn("invoice-contact: could not retrieve session", row.stripe_checkout_session_id, e);
        }
      }

      const oneOffLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { price_data: { currency: "aud", product_data: { name: oneOffLabel }, unit_amount: jobTotalCents }, quantity: 1 },
      ];
      if (oneOffProcessingFee > 0) {
        oneOffLineItems.push({ price_data: { currency: "aud", product_data: { name: "Secure Processing Fee" }, unit_amount: oneOffProcessingFee }, quantity: 1 });
      }

      let payUrl = reusableUrl;

      if (!payUrl) {
        const oneOffSession = await stripeOneOff.checkout.sessions.create({
          customer_email: oneOffContact.email,
          line_items: oneOffLineItems,
          mode: "payment",
          // CARD ONLY. Without this Stripe offers every method enabled on the
          // account — including AU BECS Direct Debit, which takes 1-3 BUSINESS
          // DAYS to clear and sits in "processing" meanwhile. A tradie sending a
          // pay-now link expects a card. (The recurring card-fallback below
          // pins this for the same reason.)
          payment_method_types: ["card"],
          success_url: `${siteUrlOneOff}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrlOneOff}/payment-cancelled`,
          payment_intent_data: {
            application_fee_amount: oneOffPlatformFee + oneOffProcessingFee,
            transfer_data: { destination: oneOffDestination },
          },
          metadata: {
            type: "job_payment_link",
            payment_type: "job_funding", // drives the webhook's job flip + tradie notification
            routing: "destination",
            job_id: oneOff.id,
            client_contact_id: oneOff.client_contact_id,
            tradie_id: oneOff.tradie_id ?? "",
            platform_fee: String(oneOffPlatformFee),
            processing_fee: String(oneOffProcessingFee),
            tradie_tier: oneOffTier,
          },
        });
        payUrl = oneOffSession.url;

        // The webhook completes this row by stripe_checkout_session_id. The payer
        // has no profile (off-app), so the row anchors to the tradie.
        const { error: payInsertErr } = await supabase.from("payments").insert({
          profile_id: oneOff.tradie_id,
          payment_type: "job_funding",
          job_id: oneOff.id,
          amount: jobTotalCents,
          status: "pending",
          stripe_checkout_session_id: oneOffSession.id,
          processing_fee: oneOffProcessingFee,
          platform_fee_cents: oneOffPlatformFee,
          fee_tier: oneOffTier,
          fee_calculated_at: new Date().toISOString(),
          metadata: {
            off_app: true,
            routing: "destination",
            client_contact_id: oneOff.client_contact_id,
            payer_email: oneOffContact.email,
            platform_fee: String(oneOffPlatformFee),
          },
        });
        if (payInsertErr) {
          console.error("invoice-contact one-off payments insert failed", payInsertErr);
          return json({ error: "Failed to record the payment" }, 500);
        }
      }

      let emailedOneOff = false;
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            to: oneOffContact.email,
            subject: `Payment for ${oneOffLabel} — ${fmtAud(jobTotal)}`,
            body: `Hi ${oneOffFirstName}, ${oneOffBusiness} has sent you a secure payment link for "${oneOffLabel}" (${fmtAud(jobTotal)}). You can pay by card in a few seconds — no account needed.`,
            notificationType: "INVOICE_RECEIVED",
            metadata: {
              amount: fmtAud(jobTotal),
              link: payUrl,
              service: oneOffLabel,
              businessName: oneOffBusiness,
            },
          }),
        });
        emailedOneOff = true;
      } catch (e) { console.error("invoice-contact: one-off email failed", e); }

      return json({
        total: jobTotal,
        stripePaymentUrl: payUrl,
        emailed: emailedOneOff,
        emailedTo: oneOffContact.email,
        // true = we re-sent the link the client already had, not a second one.
        reused: !!reusableUrl,
      });
    }

    // ─── RECURRING service invoice (original mode) ─────────────────────────────
    if (!recurringJobId) return json({ error: "Missing recurringJobId" }, 400);

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
