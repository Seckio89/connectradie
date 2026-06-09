import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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
    let supabaseUrl: string,
      supabaseServiceKey: string,
      stripeSecretKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    } catch (e) {
      console.error(e);
      return errorJson("Server configuration error", 500);
    }

    // Caller has already passed Supabase JWT verification (verify_jwt=true).
    // Defence-in-depth: require the bearer be a JWT (starts with 'ey').
    // We deliberately do NOT byte-compare against env var — the auto-injected
    // SUPABASE_SERVICE_ROLE_KEY can drift from the vault-stored secret used by
    // pg_cron after key rotations, and that mismatch silently 401'd everything.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Find jobs completed 48+ hours ago
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: completedJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, client_id, tradie_id, completed_at")
      .eq("status", "completed")
      .not("tradie_id", "is", null)
      .not("completed_at", "is", null)
      .lte("completed_at", cutoff);

    if (jobsError) {
      console.error("Failed to fetch completed jobs:", jobsError);
      return errorJson("Failed to fetch completed jobs", 500);
    }

    if (!completedJobs || completedJobs.length === 0) {
      return jsonResponse({ released: 0, total_amount: 0, errors: [] });
    }

    // Get job IDs with open disputes — exclude them
    const jobIds = completedJobs.map((j) => j.id);
    const { data: openDisputes } = await supabase
      .from("disputes")
      .select("job_id")
      .in("job_id", jobIds)
      .in("status", ["open", "under_review"]);

    const disputedJobIds = new Set(
      (openDisputes || []).map((d) => d.job_id),
    );

    let released = 0;
    let totalAmount = 0;
    const errors: string[] = [];

    for (const job of completedJobs) {
      if (disputedJobIds.has(job.id)) {
        console.info(
          `Skipping job ${job.id} — has open dispute`,
        );
        continue;
      }

      // Find the main job_funding payment that hasn't been transferred yet
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select(
          "id, amount, stripe_payment_intent_id, metadata",
        )
        .eq("job_id", job.id)
        .eq("payment_type", "job_funding")
        .eq("status", "completed")
        .maybeSingle();

      if (paymentError) {
        errors.push(`Job ${job.id}: failed to fetch payment — ${paymentError.message}`);
        continue;
      }

      if (!payment) {
        // No completed job_funding payment yet — skip
        continue;
      }

      // Already transferred
      const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;
      if (existingMetadata.transfer_id) {
        continue;
      }

      if (!payment.stripe_payment_intent_id) {
        errors.push(`Job ${job.id}: payment has no Stripe payment intent`);
        continue;
      }

      // Sum any completed price_adjustment child payments
      const { data: childPayments } = await supabase
        .from("payments")
        .select("id, amount, metadata")
        .eq("job_id", job.id)
        .eq("payment_type", "price_adjustment")
        .eq("status", "completed");

      const childTotal = (childPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

      // Deduct platform fees (same logic as release-escrow)
      let totalPlatformFee = typeof existingMetadata.platform_fee === "number"
        ? existingMetadata.platform_fee
        : 0;

      for (const child of (childPayments || [])) {
        const childMeta = (child.metadata || {}) as Record<string, unknown>;
        const childFee = typeof childMeta.platform_fee === "number"
          ? childMeta.platform_fee
          : 0;
        totalPlatformFee += childFee;
      }

      const totalBase = payment.amount + childTotal;
      const totalTransferAmount = totalBase - totalPlatformFee;

      if (totalTransferAmount <= 0) {
        errors.push(`Job ${job.id}: transfer amount is zero or negative after platform fee deduction`);
        continue;
      }

      // Get tradie's Stripe Connect account
      const { data: tradieProfile } = await supabase
        .from("profiles")
        .select(
          "stripe_connect_account_id, stripe_connect_onboarding_complete, email, full_name",
        )
        .eq("id", job.tradie_id)
        .maybeSingle();

      if (
        !tradieProfile?.stripe_connect_account_id ||
        !tradieProfile.stripe_connect_onboarding_complete
      ) {
        errors.push(
          `Job ${job.id}: tradie ${job.tradie_id} has no Connect account or incomplete onboarding`,
        );
        continue;
      }

      // Create Stripe transfer to tradie's Connect account.
      //
      // Source from the original PaymentIntent via `source_transaction` when
      // the transfer fits within the main charge. That debits the held
      // escrow funds rather than the platform's general available balance,
      // which is the bug we hit in test mode — pending Stripe settlement
      // left platform balance at $0 and every auto-release run failed with
      // "insufficient available funds" even though the held PI had plenty.
      //
      // Falls back to a platform-balance transfer when price-adjustment
      // top-ups push the total above the original charge. That edge needs
      // a per-PI multi-transfer refactor before real money flows — leaving
      // a metadata flag so we can audit how often it's hit.
      try {
        const transfer = await stripe.transfers.create({
          amount: totalTransferAmount,
          currency: "aud",
          destination: tradieProfile.stripe_connect_account_id,
          ...(totalTransferAmount <= payment.amount
            ? { source_transaction: payment.stripe_payment_intent_id }
            : {}),
          transfer_group: `job_${job.id}`,
          metadata: {
            payment_id: payment.id,
            job_id: job.id,
            client_id: job.client_id,
            tradie_id: job.tradie_id,
            auto_released: "true",
            sourced_from_pi: String(totalTransferAmount <= payment.amount),
          },
        }, {
          idempotencyKey: `auto_release_${payment.id}`,
        });

        // Update main payment metadata with transfer info. Drop pending_increase
        // — the 48hr window expired, the price adjustment is forfeit, the tradie
        // gets the original quote. Without this the stale flag keeps surfacing
        // a "Pay Difference" CTA even after the release.
        const releasedAt = new Date().toISOString();
        const { pending_increase: _droppedIncrease, ...cleanMetadata } = existingMetadata as Record<string, unknown>;
        await supabase
          .from("payments")
          .update({
            metadata: {
              ...cleanMetadata,
              transfer_id: transfer.id,
              transfer_amount: transfer.amount,
              platform_fee_deducted: totalPlatformFee,
              released_at: releasedAt,
              auto_released: true,
            },
          })
          .eq("id", payment.id);

        // Mark child payments as transferred too
        for (const child of (childPayments || [])) {
          const childMeta = (child.metadata || {}) as Record<string, unknown>;
          await supabase
            .from("payments")
            .update({
              metadata: {
                ...childMeta,
                transfer_id: transfer.id,
                released_at: releasedAt,
                auto_released: true,
              },
            })
            .eq("id", child.id);
        }

        const amountDollars = `$${(totalTransferAmount / 100).toFixed(2)}`;
        const jobTitle = job.title || "your job";
        const invoiceNumber = `INV-${payment.id.slice(0, 8).toUpperCase()}`;

        // Notify homeowner
        try {
          await supabase.from("notifications").insert({
            user_id: job.client_id,
            title: "Payment Auto-Released",
            message: `Payment of ${amountDollars} for ${jobTitle} (${invoiceNumber}) was automatically released to your tradie after 48 hours.`,
            type: "payment_auto_released",
            read: false,
            metadata: {
              job_id: job.id,
              payment_id: payment.id,
              invoice_number: invoiceNumber,
              amount: amountDollars,
              transfer_id: transfer.id,
            },
          });
        } catch (notifErr) {
          console.error(
            `Failed to notify homeowner for job ${job.id}:`,
            notifErr,
          );
        }

        // Notify homeowner via email
        try {
          const { data: homeowner } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", job.client_id)
            .maybeSingle();

          if (homeowner?.email) {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                to: homeowner.email,
                subject: `Payment of ${amountDollars} Released to Your Tradie (${invoiceNumber})`,
                body: `Hi ${homeowner.full_name || "there"},\n\nYour payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been automatically released to your tradie after the 48-hour review window.\n\nIf you have any concerns, please contact our support team.\n\nThank you for using ConnecTradie.`,
                notificationType: "PAYMENT_AUTO_RELEASED",
                metadata: { amount: amountDollars, job_id: job.id },
              }),
            }).catch((e: Error) =>
              console.error("Failed to send homeowner auto-release email:", e)
            );
          }
        } catch {
          // Non-critical
        }

        // Notify tradie
        try {
          await supabase.from("notifications").insert({
            user_id: job.tradie_id,
            title: "Payment Received",
            message: `Payment of ${amountDollars} for ${jobTitle} (${invoiceNumber}) has been released to your account.`,
            type: "payment_received",
            read: false,
            metadata: {
              job_id: job.id,
              payment_id: payment.id,
              invoice_number: invoiceNumber,
              amount: amountDollars,
              transfer_id: transfer.id,
            },
          });
        } catch (notifErr) {
          console.error(
            `Failed to notify tradie for job ${job.id}:`,
            notifErr,
          );
        }

        // Notify tradie via email
        try {
          if (tradieProfile.email) {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                to: tradieProfile.email,
                subject: `Payment of ${amountDollars} Released — Funds on the Way (${invoiceNumber})`,
                body: `Hi ${tradieProfile.full_name || "there"},\n\nGreat news! Payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been released to your account.\n\nFunds will appear in your bank account within 2-3 business days.\n\nKeep up the great work!`,
                notificationType: "PAYMENT_RECEIVED",
                metadata: { amount: amountDollars, job_id: job.id },
              }),
            }).catch((e: Error) =>
              console.error("Failed to send tradie auto-release email:", e)
            );
          }
        } catch {
          // Non-critical
        }

        released++;
        totalAmount += totalTransferAmount;
        console.info(
          `Auto-released ${amountDollars} for job ${job.id} to tradie ${job.tradie_id} (transfer ${transfer.id})`,
        );
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error
          ? stripeErr.message
          : "Stripe transfer failed";
        errors.push(`Job ${job.id}: ${msg}`);
        console.error(`Stripe transfer failed for job ${job.id}:`, stripeErr);
      }
    }

    return jsonResponse({
      released,
      total_amount: totalAmount,
      total_amount_dollars: `$${(totalAmount / 100).toFixed(2)}`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("auto-release-payments error:", err);
    const message = err instanceof Error
      ? err.message
      : "Internal server error";
    return errorJson(message, 500);
  }
});
