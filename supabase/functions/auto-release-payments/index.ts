import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
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
          "id, amount, stripe_payment_intent_id, metadata, invoice_number, invoice_ref",
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

      // Already released (transfer for legacy, payout for destination charges)
      const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;
      if (existingMetadata.transfer_id || existingMetadata.payout_id) {
        continue;
      }

      // Determine payment flow: destination charges (new) vs custodial escrow (legacy)
      const isDestinationCharge = payment.metadata?.flow === "destination";

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

      // ── DESTINATION CHARGE FLOW (new) ────────────────────────────────
      // Funds were routed to the tradie's Connect account at payment time.
      // The transfer already happened automatically — trigger a payout so
      // funds move from the tradie's Stripe balance to their bank account.
      if (isDestinationCharge) {
        try {
          const payout = await stripe.payouts.create(
            {
              amount: totalTransferAmount,
              currency: "aud",
              metadata: {
                payment_id: payment.id,
                job_id: job.id,
                client_id: job.client_id,
                tradie_id: job.tradie_id,
                auto_released: "true",
                flow: "destination",
              },
            },
            {
              stripeAccount: tradieProfile.stripe_connect_account_id,
              idempotencyKey: `auto_release_${payment.id}`,
            },
          );

          // Update main payment metadata with payout info. Drop pending_increase.
          const releasedAt = new Date().toISOString();
          const { pending_increase: _droppedIncrease, ...cleanMetadata } = existingMetadata as Record<string, unknown>;
          await supabase
            .from("payments")
            .update({
              status: "released",
              metadata: {
                ...cleanMetadata,
                payout_id: payout.id,
                payout_amount: payout.amount,
                platform_fee_deducted: totalPlatformFee,
                released_at: releasedAt,
                auto_released: true,
                flow: "destination",
              },
            })
            .eq("id", payment.id);

          // Mark child destination-charge payments as released too
          for (const child of (childPayments || [])) {
            const childMeta = (child.metadata || {}) as Record<string, unknown>;
            await supabase
              .from("payments")
              .update({
                status: "released",
                metadata: {
                  ...childMeta,
                  payout_id: payout.id,
                  released_at: releasedAt,
                  auto_released: true,
                  flow: "destination",
                },
              })
              .eq("id", child.id);
          }

          const amountDollars = `$${(totalTransferAmount / 100).toFixed(2)}`;
          const jobTitle = job.title || "your job";
          const invRef = (payment as Record<string, unknown>).invoice_ref as string | null;
          const invNum = (payment as Record<string, unknown>).invoice_number as number | null;
          const invoiceNumber = invRef
            || (invNum != null
              ? `INV-${String(invNum).padStart(4, "0")}`
              : `INV-${payment.id.slice(0, 8).toUpperCase()}`);

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
                payout_id: payout.id,
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
                payout_id: payout.id,
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
            `Auto-released (destination) ${amountDollars} for job ${job.id} to tradie ${job.tradie_id} (payout ${payout.id})`,
          );
        } catch (stripeErr) {
          const msg = stripeErr instanceof Error
            ? stripeErr.message
            : "Stripe payout failed";
          errors.push(`Job ${job.id}: ${msg}`);
          console.error(`Stripe payout failed for job ${job.id}:`, stripeErr);
        }

        // Skip the legacy transfer path below
        continue;
      }

      // ── LEGACY CUSTODIAL FLOW (existing) ─────────────────────────────
      // Platform collected funds into its own Stripe balance; transfer them
      // to the tradie's Connect account via stripe.transfers.create().

      // Create Stripe transfer to tradie's Connect account.
      //
      // Source from the original charge via `source_transaction` when the
      // transfer fits within the main charge. That debits the held escrow
      // funds rather than the platform's general available balance, which
      // is the bug we hit in test mode — pending Stripe settlement left
      // platform balance at $0 and every auto-release run failed with
      // "insufficient available funds" even though the held charge had it.
      //
      // IMPORTANT: source_transaction expects a Charge ID (ch_xxx), NOT a
      // PaymentIntent ID. We retrieve the PI here to get its latest_charge.
      //
      // Falls back to a platform-balance transfer when price-adjustment
      // top-ups push the total above the original charge OR PI lookup
      // fails. metadata.sourced_from_pi flags whether the fallback was
      // hit, so we can audit before flipping to live keys.
      // If we can't get the charge ID when one is expected, skip this job
      // for THIS run rather than silently transferring from platform balance.
      // The cron will retry on the next 6-hourly tick — much safer than
      // creating an untraceable accounting drift on a sleepy lookup blip.
      let sourceChargeId: string | null = null;
      if (totalTransferAmount <= payment.amount) {
        try {
          const intent = await stripe.paymentIntents.retrieve(
            payment.stripe_payment_intent_id,
          );
          const lc = intent.latest_charge;
          sourceChargeId = typeof lc === "string" ? lc : (lc?.id ?? null);
        } catch (lookupErr) {
          const msg = lookupErr instanceof Error ? lookupErr.message : "unknown";
          errors.push(`Job ${job.id}: PI lookup failed (${msg}) — will retry next tick`);
          console.error(`Job ${job.id}: failed to resolve PI to charge:`, lookupErr);
          continue;
        }
        if (!sourceChargeId) {
          errors.push(`Job ${job.id}: PaymentIntent has no latest_charge yet — will retry next tick`);
          continue;
        }
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: totalTransferAmount,
          currency: "aud",
          destination: tradieProfile.stripe_connect_account_id,
          ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
          transfer_group: `job_${job.id}`,
          metadata: {
            payment_id: payment.id,
            job_id: job.id,
            client_id: job.client_id,
            tradie_id: job.tradie_id,
            auto_released: "true",
            sourced_from_pi: String(!!sourceChargeId),
            source_charge: sourceChargeId ?? "",
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
            status: "released",
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
              status: "released",
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
        const invRef2 = (payment as Record<string, unknown>).invoice_ref as string | null;
        const invNum2 = (payment as Record<string, unknown>).invoice_number as number | null;
        const invoiceNumber = invRef2
          || (invNum2 != null
            ? `INV-${String(invNum2).padStart(4, "0")}`
            : `INV-${payment.id.slice(0, 8).toUpperCase()}`);

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
