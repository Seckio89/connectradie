import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier } from "../_shared/pricing.ts";

/*
  public-quote — token-gated public access to a quote sent to an OFF-APP client.

  The client isn't a ConnecTradie user, so there's no JWT. Access is via the
  unguessable quotes.public_token generated when the tradie emails the quote.
  Deploy WITHOUT JWT verification:
    supabase functions deploy public-quote --no-verify-jwt

  POST body:
    { "token": "<uuid>", "action": "view" | "accept" | "decline" | "release" }

  Accepting a quote FUNDS the job through Stripe escrow (destination charge with
  the platform + processing fee) when we can: a definite price, a Stripe-onboarded
  tradie, and the escrow path. That's what makes the platform its fee — previously
  acceptance took no payment. When a deposit can't be taken (a price range, tradie
  not onboarded, or a genuine external-pay client) acceptance stays record-only.
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

    let payload: { token?: string; action?: string; reason?: string };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const action =
      payload.action === "accept" ? "accept"
      : payload.action === "decline" ? "decline"
      : payload.action === "release" ? "release"
      : "view";
    const declineReason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 1000) : "";
    if (!UUID_RE.test(token)) return json({ error: "Invalid quote link" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, job_id, tradie_id, price_min, price_max, firm_price, message, status, accepted_at, proposed_start_date, created_at, estimated_duration, includes_materials, requires_site_inspection, final_valid_until, call_out_fee_cents")
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
      .select("full_name, email, avatar_url, stripe_connect_account_id, stripe_connect_onboarding_complete, external_pay_allowed, abn_number, abn_verified, abn_entity_name, license_number, license_state, license_class, license_verified, is_gst_registered, is_identity_verified, insurance_policy, created_at")
      .eq("id", quote.tradie_id)
      .maybeSingle();

    const { data: td } = await supabase
      .from("tradie_details")
      .select("business_name, subscription_tier, trade_category, is_insured, is_licensed, insurance_provider")
      .eq("profile_id", quote.tradie_id)
      .maybeSingle();

    // The off-app client (for their name in alerts, how they pay, and where to
    // send the Stripe receipt). Fetched once and reused below.
    const { data: clientContact } = job?.client_contact_id
      ? await supabase
          .from("client_contacts")
          .select("full_name, email, payment_method, suburb, state")
          .eq("id", job.client_contact_id)
          .maybeSingle()
      : { data: null };

    // ── Escrow-deposit eligibility ────────────────────────────────────────────
    // We can fund the job on acceptance only with a definite amount, an onboarded
    // tradie to receive the destination charge, and the escrow path (not a genuine
    // external-pay client). `payable` drives the client's "pay" button.
    const chargeDollars =
      quote.firm_price != null ? Number(quote.firm_price)
      : (quote.price_min != null && quote.price_min === quote.price_max) ? Number(quote.price_min)
      : null;
    const contactIsExternal = (clientContact?.payment_method || "external") === "external";
    const escrowRequired = !(contactIsExternal && tradie?.external_pay_allowed === true);
    const destinationAccount =
      tradie?.stripe_connect_onboarding_complete ? tradie?.stripe_connect_account_id : null;
    // Whether a deposit *could* be taken (paid-state is combined in at the call
    // site and in the response, since `paymentPaid` is computed just below).
    const depositEligible =
      !!chargeDollars && chargeDollars > 0 && escrowRequired && !!destinationAccount;
    // Set when we mint (or reuse) a Stripe Checkout the client should be sent to.
    let paymentUrl: string | null = null;

    // Escrow state for this job's funding payment — drives the client's
    // "Approve & release payment" button (shown only when paid, job completed,
    // and not yet released).
    const { data: fpRows } = await supabase
      .from("payments")
      .select("status, metadata")
      .eq("job_id", quote.job_id)
      .eq("payment_type", "job_funding")
      .order("created_at", { ascending: false })
      .limit(1);
    const fundingPayment = fpRows?.[0];
    const fpMeta = (fundingPayment?.metadata || {}) as Record<string, unknown>;
    const paymentReleased = !!fpMeta.transfer_id || !!fpMeta.payout_id || fundingPayment?.status === "released";
    const paymentPaid = !!fundingPayment && (fundingPayment.status === "completed" || fundingPayment.status === "released");

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

        const clientFirst = clientContact?.full_name ? clientContact.full_name.split(" ")[0] : "Your client";

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

      // ── Fund the job through Stripe escrow ──────────────────────────────────
      // Runs whether or not this call was the one that flipped the quote to
      // accepted (so a client who abandoned checkout can retry). No-ops cleanly
      // if a deposit can't be taken or the job is already funded.
      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeSecretKey && depositEligible && !paymentPaid && chargeDollars) {
        try {
          const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
          const chargeCents = Math.round(chargeDollars * 100);
          const tier = resolveTradieTier(td?.subscription_tier);
          const platformFeeCents = Math.round(calculatePlatformFee(chargeDollars, tier) * 100);
          const processingFeeCents = calculateProcessingFeeCents(chargeCents);

          // Reuse an existing OPEN checkout session instead of minting a second
          // live pay link — a client who clicks twice must never be double-charged.
          let reusableUrl: string | null = null;
          const { data: openPays } = await supabase
            .from("payments")
            .select("id, stripe_checkout_session_id")
            .eq("job_id", quote.job_id)
            .eq("payment_type", "job_funding")
            .eq("status", "pending")
            .not("stripe_checkout_session_id", "is", null)
            .order("created_at", { ascending: false });
          for (const row of (openPays as { id: string; stripe_checkout_session_id: string }[] | null) ?? []) {
            try {
              const existing = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
              if (existing.status === "open" && existing.url && !reusableUrl) reusableUrl = existing.url;
              else if (existing.status === "expired") {
                await supabase.from("payments").update({ status: "failed" }).eq("id", row.id);
              }
            } catch (e) {
              console.warn("public-quote: could not retrieve session", row.stripe_checkout_session_id, e);
            }
          }

          if (reusableUrl) {
            paymentUrl = reusableUrl;
          } else {
            const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
            const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
              { price_data: { currency: "aud", product_data: { name: job?.title || "Job" }, unit_amount: chargeCents }, quantity: 1 },
            ];
            if (processingFeeCents > 0) {
              lineItems.push({ price_data: { currency: "aud", product_data: { name: "Secure Processing Fee" }, unit_amount: processingFeeCents }, quantity: 1 });
            }
            const checkoutSession = await stripe.checkout.sessions.create({
              customer_email: clientContact?.email || undefined,
              line_items: lineItems,
              mode: "payment",
              // Card only — BECS/other methods can take days to clear; the client
              // is paying a deposit now to fund the job.
              payment_method_types: ["card"],
              success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${siteUrl}/quote/${token}`,
              payment_intent_data: {
                application_fee_amount: platformFeeCents + processingFeeCents,
                transfer_data: { destination: destinationAccount! },
              },
              metadata: {
                type: "job_payment_link",
                payment_type: "job_funding", // webhook flips the job + notifies the tradie
                routing: "destination",
                job_id: quote.job_id,
                client_contact_id: job?.client_contact_id ?? "",
                tradie_id: quote.tradie_id,
                platform_fee: String(platformFeeCents),
                processing_fee: String(processingFeeCents),
                tradie_tier: tier,
              },
            });
            paymentUrl = checkoutSession.url ?? null;

            // The webhook completes this row by stripe_checkout_session_id. The
            // payer is off-app (no profile), so the row anchors to the tradie.
            const { error: payErr } = await supabase.from("payments").insert({
              profile_id: quote.tradie_id,
              payment_type: "job_funding",
              job_id: quote.job_id,
              amount: chargeCents,
              status: "pending",
              stripe_checkout_session_id: checkoutSession.id,
              processing_fee: processingFeeCents,
              platform_fee_cents: platformFeeCents,
              fee_tier: tier,
              fee_calculated_at: new Date().toISOString(),
              metadata: {
                off_app: true,
                routing: "destination",
                client_contact_id: job?.client_contact_id ?? null,
                payer_email: clientContact?.email ?? null,
                platform_fee: String(platformFeeCents),
              },
            });
            if (payErr) console.error("public-quote: funding payment insert failed", payErr);
          }
        } catch (e) {
          // Non-fatal: acceptance still succeeds; the tradie can send a pay link.
          console.error("public-quote: escrow deposit creation failed", e);
        }
      }
    }

    if (action === "decline") {
      // Only a still-open quote can be declined; declining an already-terminal
      // quote is a no-op success (idempotent).
      const terminal = ["accepted", "declined", "withdrawn", "expired"];
      if (!terminal.includes(quote.status)) {
        const nowIso = new Date().toISOString();
        await supabase
          .from("quotes")
          .update({ status: "declined", declined_at: nowIso, decline_reason: declineReason || null, updated_at: nowIso })
          .eq("id", quote.id);
        // Mirror onto the off-app job so the tradie's list reflects it and the
        // existing declined-job UI can show the reason.
        await supabase
          .from("jobs")
          .update({ status: "declined", decline_reason: declineReason || null, declined_at: nowIso })
          .eq("id", quote.job_id);

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
        const reasonLine = declineReason ? ` Reason: "${declineReason}"` : "";

        // In-app notification for the tradie.
        await supabase.from("notifications").insert({
          user_id: quote.tradie_id,
          type: "quote_declined",
          title: "Quote declined",
          message: `${clientFirst} declined your quote for ${jobTitle}.${reasonLine}`,
          job_id: quote.job_id,
          read: false,
        });

        // Email the tradie too.
        if (tradie?.email) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                to: tradie.email,
                subject: `Quote declined — ${jobTitle}`,
                body: `${clientFirst} declined your quote for "${jobTitle}".${reasonLine} No further action is needed.`,
                notificationType: "QUOTE_DECLINED",
                metadata: { link: "https://connectradie.com/work" },
              }),
            });
          } catch (e) {
            console.error("Failed to send quote-declined email:", e);
          }
        }
      }
    }

    if (action === "release") {
      // Client approves early payout. Only a completed, paid, not-yet-released
      // job can be released; delegate to the tested release engine (idempotent,
      // excludes disputes) so no Stripe logic is duplicated here.
      if (job?.status !== "completed") {
        return json({ error: "This job isn’t marked complete yet." }, 400);
      }
      if (!paymentReleased) {
        try {
          const rel = await fetch(`${supabaseUrl}/functions/v1/auto-release-payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ jobId: quote.job_id }),
          });
          if (!rel.ok) {
            console.error("release delegate failed:", await rel.text());
            return json({ error: "Could not release the payment. Please try again." }, 502);
          }
        } catch (e) {
          console.error("release delegate error:", e);
          return json({ error: "Could not release the payment. Please try again." }, 502);
        }
        // Defensive: confirm the funds ACTUALLY released before reporting success,
        // so a no-op (e.g. dispute open, or release engine not yet updated) can
        // never show the client a false "payment released".
        const { data: after } = await supabase
          .from("payments")
          .select("status, metadata")
          .eq("job_id", quote.job_id)
          .eq("payment_type", "job_funding")
          .order("created_at", { ascending: false })
          .limit(1);
        const aMeta = (after?.[0]?.metadata || {}) as Record<string, unknown>;
        const nowReleased = !!aMeta.transfer_id || !!aMeta.payout_id || after?.[0]?.status === "released";
        if (!nowReleased) {
          return json({ error: "Couldn’t release the payment just now — it will release automatically within 48 hours of completion." }, 409);
        }
      }
      return json({ status: quote.status, jobStatus: "completed", payment: { paid: true, released: true } });
    }

    const finalStatus =
      action === "accept" ? "accepted"
      : action === "decline" ? "declined"
      : quote.status;

    // A human quote reference from the id, e.g. "Q-1A2B3C4D".
    const reference = `Q-${String(quote.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const tradeLabel = td?.trade_category
      ? String(td.trade_category).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

    return json({
      status: finalStatus,
      reference,
      issuedDate: quote.created_at ?? null,
      validUntil: quote.final_valid_until ?? null,
      quote: {
        priceMin: quote.price_min,
        priceMax: quote.price_max,
        firmPrice: quote.firm_price,
        message: quote.message,
        proposedStartDate: quote.proposed_start_date,
        estimatedDuration: quote.estimated_duration ?? null,
        includesMaterials: quote.includes_materials ?? null,
        requiresSiteInspection: quote.requires_site_inspection ?? null,
        callOutFee: quote.call_out_fee_cents ? Number(quote.call_out_fee_cents) / 100 : null,
        gstRegistered: tradie?.is_gst_registered === true,
      },
      job: {
        title: job?.title ?? null,
        description: job?.description ?? null,
        address: job?.location_address ?? null,
        status: job?.status ?? null,
      },
      client: {
        name: clientContact?.full_name ?? null,
        location: [clientContact?.suburb, clientContact?.state].filter(Boolean).join(", ") || null,
      },
      payment: {
        paid: paymentPaid,
        released: paymentReleased,
        // A deposit can be taken now (client should be sent to pay).
        payable: depositEligible && !paymentPaid,
        // Present when this call minted/reused a Checkout to redirect the client to.
        url: paymentUrl,
      },
      tradie: {
        name: tradie?.full_name ?? null,
        business: td?.business_name ?? null,
        avatarUrl: tradie?.avatar_url ?? null,
        trade: tradeLabel,
        memberSince: tradie?.created_at ?? null,
        // Trust credentials — verification flags a client wants to see on a quote.
        // Deliberately NOT the tradie's phone/email: keeping direct contact off the
        // pre-payment quote protects the escrow flow.
        abn: tradie?.abn_number ?? null,
        abnVerified: tradie?.abn_verified === true,
        entityName: tradie?.abn_entity_name ?? null,
        license: (tradie?.license_number || td?.is_licensed)
          ? {
              number: tradie?.license_number ?? null,
              state: tradie?.license_state ?? null,
              cls: tradie?.license_class ?? null,
              verified: tradie?.license_verified === true,
            }
          : null,
        insured: td?.is_insured === true || tradie?.insurance_policy === true,
        insurer: td?.insurance_provider ?? null,
        identityVerified: tradie?.is_identity_verified === true,
      },
    });
  } catch (err) {
    console.error("public-quote error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
