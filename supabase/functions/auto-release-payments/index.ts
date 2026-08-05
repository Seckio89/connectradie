import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { frozenCents, recordFeeCharge } from "../_shared/feeContext.ts";
import { createReleasePayout } from "../_shared/instantPayout.ts";
import { expirePendingVariations } from "../_shared/expireVariations.ts";
import { clearPayoutFailure, markPayoutFailed } from "../_shared/payoutFailure.ts";

const formatAud = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Minimal structural type — avoids importing the Supabase SDK here. */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

/**
 * Write the reason a payout attempt failed onto the payment row.
 *
 * Every failure below used to go only into `errors[]` — an array returned in
 * the HTTP response of a CRON invocation, which by definition nobody reads —
 * and a console line. The row itself was untouched, so a payment could be
 * retried every six hours for days while still displaying the first error
 * release-escrow wrote, with no way to tell the two apart. See payoutFailure.ts.
 *
 * Best-effort by contract, like recordInstantPayoutFee: this is bookkeeping
 * ABOUT a failure, and it must never itself throw and skip the `continue` that
 * lets the remaining jobs in the batch run.
 */
async function recordPayoutFailure(
  supabase: SupabaseLike,
  paymentId: string,
  metadata: Record<string, unknown> | null | undefined,
  message: string,
): Promise<void> {
  try {
    await supabase
      .from("payments")
      .update({ metadata: markPayoutFailed(metadata, message, new Date().toISOString()) })
      .eq("id", paymentId);
  } catch (err) {
    console.error(`Could not record payout failure for payment ${paymentId}:`, err);
  }
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

    // Auth: the caller must hold a SERVICE-ROLE-capable key. We verify by
    // capability, not by shape or byte-compare: attempt an admin-API call with
    // the PRESENTED key. Works for legacy JWT service keys AND new sb_secret_*
    // keys (which broke the old `startsWith("Bearer ey")` check and 401'd the
    // public-quote release delegate), and rejects anon/user JWTs — which the
    // old check wrongly let through.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Unauthorized", 401);
    }
    try {
      const probe = createClient(supabaseUrl, authHeader.slice(7));
      const { error: probeErr } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (probeErr) return errorJson("Unauthorized", 401);
    } catch {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Client review window: completed jobs auto-release after this many hours
    // if the client takes no action. Keep in sync with src/lib/releaseWindow.ts.
    const RELEASE_WINDOW_HOURS = 5;

    // Optional single-job EARLY release: a client clicked "Approve & release" on
    // their quote link before the review window elapsed. When a jobId is provided
    // we release just that job immediately (skipping the cutoff); otherwise this
    // is the scheduled cron run that sweeps everything past the window.
    // Everything downstream (dispute exclusion, idempotency keys, transfer/payout
    // logic, notifications) is identical either way — the ONLY difference is which
    // jobs are selected.
    let requestedJobId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.jobId === "string") requestedJobId = body.jobId;
    } catch {
      // No/empty body — scheduled cron run.
    }

    const baseQuery = supabase
      .from("jobs")
      .select("id, title, client_id, tradie_id, completed_at")
      .eq("status", "completed")
      .not("tradie_id", "is", null)
      .not("completed_at", "is", null);

    const cutoff = new Date(Date.now() - RELEASE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: completedJobs, error: jobsError } = requestedJobId
      ? await baseQuery.eq("id", requestedJobId)
      : await baseQuery.lte("completed_at", cutoff);

    if (jobsError) {
      console.error("Failed to fetch completed jobs:", jobsError);
      return errorJson("Failed to fetch completed jobs", 500);
    }

    if (!completedJobs || completedJobs.length === 0) {
      return jsonResponse({ released: 0, total_amount: 0, errors: [] });
    }

    // Get job IDs with a live dispute — exclude them.
    //
    // `blocks_release` is a GENERATED column on disputes; do NOT go back to
    // enumerating statuses here. This used to be `.in("status", [...])`, and a
    // status added to the CHECK constraint without also being added to that
    // literal would silently fail to match — releasing escrow to the tradie
    // while the dispute was still live. No error, no failing test, money gone.
    // The column keeps the vocabulary and this query from drifting apart.
    const jobIds = completedJobs.map((j) => j.id);
    const { data: openDisputes } = await supabase
      .from("disputes")
      .select("job_id")
      .in("job_id", jobIds)
      .eq("blocks_release", true);

    const disputedJobIds = new Set(
      (openDisputes || []).map((d) => d.job_id),
    );

    let released = 0;
    let totalAmount = 0;
    const errors: string[] = [];

    // Fetch every releasable job_funding payment for these jobs in one query.
    //
    // This used to be a per-job `.maybeSingle()`, which was a silent stall: a job
    // can legitimately have MORE THAN ONE `job_funding` payment — create-job-deposit
    // and pay-milestone both insert rows with that exact payment_type. Two matching
    // rows makes PostgREST return an ERROR rather than a row, so every deposit job
    // and every multi-milestone job failed here on every single cron tick. Because
    // Connect accounts are on a manual payout schedule, that money then sat in the
    // tradie's balance indefinitely with nothing else to sweep it up.
    //
    // Flattening to (job, payment) pairs fixes it without restructuring the loop
    // body below, which already handles exactly one payment and carries its own
    // per-payment idempotency keys.
    const releasableJobIds = completedJobs
      .filter((j) => !disputedJobIds.has(j.id))
      .map((j) => j.id);

    // Bail before querying rather than passing an empty .in() list — a non-uuid
    // placeholder would make PostgREST reject the whole query as invalid uuid
    // syntax, turning "every completed job is disputed" into a hard failure.
    if (releasableJobIds.length === 0) {
      return jsonResponse({ released: 0, total_amount: 0, errors: [] });
    }

    const { data: fundingPayments, error: paymentsError } = await supabase
      .from("payments")
      .select(
        "id, job_id, amount, stripe_payment_intent_id, metadata, invoice_number, invoice_ref, fee_rate_bps, fee_rate_type",
      )
      .in("job_id", releasableJobIds)
      .eq("payment_type", "job_funding")
      .eq("status", "completed");

    if (paymentsError) {
      return jsonResponse(
        { released: 0, total_amount: 0, errors: [`Failed to fetch payments — ${paymentsError.message}`] },
        500,
      );
    }

    const jobById = new Map(completedJobs.map((j) => [j.id, j]));
    const workItems: { job: typeof completedJobs[number]; payment: NonNullable<typeof fundingPayments>[number] }[] = [];
    for (const payment of fundingPayments || []) {
      // Already released (transfer for legacy, payout for destination charges)
      const meta = (payment.metadata || {}) as Record<string, unknown>;
      if (meta.transfer_id || meta.payout_id) continue;
      const job = jobById.get(payment.job_id);
      if (!job) continue;
      workItems.push({ job, payment });
    }

    for (const { job, payment } of workItems) {
      const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;

      // Determine payment flow: destination charges (new) vs custodial escrow
      // (legacy). Writers are inconsistent — accept-and-pay et al. stamp
      // metadata.flow, while invoice-contact / approve-invoice / BECS stamp
      // metadata.routing. Either means the funds already moved to the tradie's
      // Connect account at charge time, so the LEGACY transfer path must not run.
      const isDestinationCharge =
        payment.metadata?.flow === "destination" ||
        payment.metadata?.routing === "destination";

      if (!payment.stripe_payment_intent_id) {
        const msg = "payment has no Stripe payment intent";
        errors.push(`Job ${job.id}: ${msg}`);
        await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
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

      // Deduct platform fees (same logic as release-escrow — and it MUST stay
      // identical: the two share an idempotency key, so any divergence in the
      // computed amount makes Stripe reject the racing retry).
      let totalPlatformFee = frozenCents(existingMetadata.platform_fee);
      // GST (metadata.gst, cents string) was routed to the tradie's balance on
      // destination charges — include it in the payout so it reaches their bank.
      let totalGst = Number(existingMetadata.gst) || 0;
      // Commission / materials split, needed for the §7A fee ledger below.
      // Mirrors release-escrow/index.ts:196-197 exactly.
      let totalCommission = frozenCents(existingMetadata.commission);
      let totalMaterialsProcessing = frozenCents(existingMetadata.materials_processing);

      for (const child of (childPayments || [])) {
        const childMeta = (child.metadata || {}) as Record<string, unknown>;
        totalPlatformFee += frozenCents(childMeta.platform_fee);
        totalGst += Number(childMeta.gst) || 0;
        totalCommission += frozenCents(childMeta.commission);
        totalMaterialsProcessing += frozenCents(childMeta.materials_processing);
      }

      // Pre-v2.1 rows carry only platform_fee. Attribute the whole of it to
      // commission so the breakdown reconciles rather than showing $0.
      // Same fallback as release-escrow/index.ts:213-215.
      if (totalCommission === 0 && totalMaterialsProcessing === 0 && totalPlatformFee > 0) {
        totalCommission = totalPlatformFee;
      }

      const totalBase = payment.amount + childTotal;
      const totalTransferAmount = totalBase - totalPlatformFee;

      if (totalTransferAmount <= 0) {
        const msg = "transfer amount is zero or negative after platform fee deduction";
        errors.push(`Job ${job.id}: ${msg}`);
        await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
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
        const msg = `tradie ${job.tradie_id} has no Connect account or incomplete onboarding`;
        errors.push(`Job ${job.id}: ${msg}`);
        await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
        continue;
      }

      // ── DESTINATION CHARGE FLOW (new) ────────────────────────────────
      // Funds were routed to the tradie's Connect account at payment time.
      // The transfer already happened automatically — trigger a payout so
      // funds move from the tradie's Stripe balance to their bank account.
      if (isDestinationCharge) {
        // Pay out base + GST − platform fee (what actually landed in the balance).
        // MUST match release-escrow's amount — shared idempotency key.
        const destinationPayoutCents = totalTransferAmount + totalGst;
        try {
          // Honours tradie_details.payout_speed_preference. The decision is a
          // pure function of the preference and the amount, so a client release
          // racing this cron reaches the same answer and the shared idempotency
          // key stays valid — see _shared/instantPayout.ts.
          const outcome = await createReleasePayout({
            stripe,
            supabase,
            tradieId: job.tradie_id,
            connectAccountId: tradieProfile.stripe_connect_account_id,
            amountCents: destinationPayoutCents,
            metadata: {
              payment_id: payment.id,
              job_id: job.id,
              client_id: job.client_id,
              tradie_id: job.tradie_id,
              auto_released: "true",
              gst: String(totalGst),
              flow: "destination",
            },
            // Deterministic key shared with release-escrow so a cron run racing a
            // client release can't create two payouts for one payment.
            idempotencyKeyBase: `release_payout_${payment.id}`,
          });
          const payout = outcome.payout;

          // Update main payment metadata with payout info. Drop pending_increase.
          const releasedAt = new Date().toISOString();
          const { pending_increase: _droppedIncrease, ...withIncreaseDropped } = existingMetadata as Record<string, unknown>;
          // Drop any failure recorded by an earlier attempt. Without this the row
          // lands 'released' still carrying payout_pending: true, and NOTHING
          // clears it — payout-reconciliation only scans rows still at
          // 'completed', so it cannot even see the ones it would want to flag.
          const cleanMetadata = clearPayoutFailure(withIncreaseDropped);
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
                // See release-escrow: an instant payout lands less than the
                // released amount because Stripe collects the fee.
                payout_method: outcome.method,
                ...(outcome.feeCents > 0 ? { instant_fee_cents: outcome.feeCents } : {}),
              },
            })
            .eq("id", payment.id);

          // Dropping pending_increase kills the CTA; without this the variation
          // itself stays 'pending' forever with nothing able to fund it.
          try {
            await expirePendingVariations(supabase, payment.job_id);
          } catch (expireErr) {
            console.error("Failed to expire variations after auto-release:", expireErr);
          }

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

          // §7A: record the commission for tax-invoicing.
          //
          // This was missing entirely, and this is the DEFAULT release path —
          // most clients never click "Approve & Release", so the 5-hour cron is
          // what actually releases the money. Commission was collected via
          // application_fee_amount but no platform_fee_charges row was written,
          // and that table is the only thing issue-fee-invoices reads. Result:
          // GST-inclusive commission retained with no tax invoice ever issued
          // for it, and no input credit available to the tradie.
          //
          // Best-effort by design: recordFeeCharge never throws and is
          // idempotent on payment_id (23505), so it cannot fail a payout that
          // has already moved money, and it is safe if release-escrow raced us.
          await recordFeeCharge(supabase, {
            tradieProfileId: job.tradie_id,
            paymentId: payment.id,
            jobId: payment.job_id,
            commissionCents: totalCommission,
            materialsProcessingCents: totalMaterialsProcessing,
            feeRateBps: (payment.fee_rate_bps as number | null) ?? (frozenCents(existingMetadata.fee_rate_bps) || null),
            feeRateType: (payment.fee_rate_type as string | null)
              ?? (typeof existingMetadata.fee_rate_type === "string" ? existingMetadata.fee_rate_type : null),
          });

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
              message: `Payment of ${amountDollars} for ${jobTitle} (${invoiceNumber}) was automatically released to your tradie after the review window.`,
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
                  body: `Hi ${homeowner.full_name || "there"},\n\nYour payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been automatically released to your tradie after the 5-hour review window.\n\nIf you have any concerns, please contact our support team.\n\nThank you for using ConnecTradie.`,
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
              // Wording tracks the Payouts card: a payout has just been CREATED,
              // so this money is "Heading to your bank", not "In your account".
              // Saying "released to your account" here had tradies expecting
              // money that was still 2-3 business days away.
              title: outcome.method === "instant" ? "Payout On Its Way — Instant" : "Payout On Its Way",
              message: outcome.method === "instant"
                ? `${jobTitle} (${invoiceNumber}) approved — ${formatAud(payout.amount)} is heading to your bank now and should arrive within minutes. Instant transfer fee: ${formatAud(outcome.feeCents)}.`
                : `${jobTitle} (${invoiceNumber}) approved — ${amountDollars} is heading to your bank, arriving in 2-3 business days.`,
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
                  subject: `${amountDollars} approved — heading to your bank (${invoiceNumber})`,
                  body: `Hi ${tradieProfile.full_name || "there"},\n\nGreat news! Payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been approved and is now heading to your bank.\n\n${
                    outcome.method === "instant"
                      ? `You're on instant payouts, so ${formatAud(payout.amount)} should arrive within minutes (instant transfer fee: ${formatAud(outcome.feeCents)}).`
                      : "It should arrive within 2-3 business days."
                  }\n\nKeep up the great work!`,
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
          // The row stays 'completed' so the next tick retries — but until now it
          // also stayed SILENT, which is how two live payments sat unpaid for
          // days looking exactly like ones nobody had attempted.
          await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
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
          await recordPayoutFailure(supabase, payment.id, existingMetadata, `PI lookup failed: ${msg}`);
          continue;
        }
        if (!sourceChargeId) {
          const msg = "PaymentIntent has no latest_charge yet";
          errors.push(`Job ${job.id}: ${msg} — will retry next tick`);
          await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
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
          // MUST match release-escrow's key exactly. These two paths can both
          // transfer the same payment, and a differing key means Stripe treats
          // them as separate requests and creates TWO transfers.
          idempotencyKey: `release_transfer_${payment.id}`,
        });

        // Update main payment metadata with transfer info. Drop pending_increase
        // — the 48hr window expired, the price adjustment is forfeit, the tradie
        // gets the original quote. Without this the stale flag keeps surfacing
        // a "Pay Difference" CTA even after the release.
        const releasedAt = new Date().toISOString();
        const { pending_increase: _droppedIncrease, ...withIncreaseDropped } = existingMetadata as Record<string, unknown>;
        // See the destination path: a row that failed earlier must not land
        // 'released' still flagged payout_pending.
        const cleanMetadata = clearPayoutFailure(withIncreaseDropped);
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

        // Same as the destination path: the CTA is gone, so the variation must
        // not linger as actionable with no way left to fund it.
        try {
          await expirePendingVariations(supabase, payment.job_id);
        } catch (expireErr) {
          console.error("Failed to expire variations after auto-release:", expireErr);
        }

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

        // §7A: same commission ledger write as the destination path above.
        await recordFeeCharge(supabase, {
          tradieProfileId: job.tradie_id,
          paymentId: payment.id,
          jobId: payment.job_id,
          commissionCents: totalCommission,
          materialsProcessingCents: totalMaterialsProcessing,
          feeRateBps: (payment.fee_rate_bps as number | null) ?? (frozenCents(existingMetadata.fee_rate_bps) || null),
          feeRateType: (payment.fee_rate_type as string | null)
            ?? (typeof existingMetadata.fee_rate_type === "string" ? existingMetadata.fee_rate_type : null),
        });

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
            message: `Payment of ${amountDollars} for ${jobTitle} (${invoiceNumber}) was automatically released to your tradie after the review window.`,
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
                body: `Hi ${homeowner.full_name || "there"},\n\nYour payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been automatically released to your tradie after the 5-hour review window.\n\nIf you have any concerns, please contact our support team.\n\nThank you for using ConnecTradie.`,
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
            // LEGACY CUSTODIAL branch: the money moved by transfer into the
            // tradie's Stripe BALANCE — no payout exists, so nothing is on its
            // way to a bank yet. The card calls this state "Ready to pay out";
            // "released to your account" implied it had already landed.
            title: "Payment Approved",
            message: `${jobTitle} (${invoiceNumber}) approved — ${amountDollars} is ready to pay out and will be sent to your bank on your next payout.`,
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
                subject: `${amountDollars} approved and ready to pay out (${invoiceNumber})`,
                body: `Hi ${tradieProfile.full_name || "there"},\n\nGreat news! Payment of ${amountDollars} for "${jobTitle}" (Invoice: ${invoiceNumber}) has been approved and is now ready to pay out.\n\nIt'll be sent to your bank on your next payout.\n\nKeep up the great work!`,
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
        await recordPayoutFailure(supabase, payment.id, existingMetadata, msg);
      }
    }

    // ── Sweep: finish dispute splits whose payout leg could not run yet ──────
    //
    // A split refunds the client and then pays the tradie their remainder. On
    // destination charges that remainder sits in the tradie's Stripe balance —
    // and it is PENDING until the original charge settles (~2 business days on
    // AU cards). Release becomes possible 5 hours after completion, so a
    // promptly-resolved dispute will normally find $0.00 AVAILABLE and the
    // payout leg fails with "insufficient funds". Measured on acct_1TtSLp2…:
    // $0.00 available against $64.90 pending, three days after the charge.
    //
    // That is the COMMON case, not an edge case. And the main loop above cannot
    // recover it: it only rescans status='completed', while a split deliberately
    // writes 'released' so nothing can double-pay the full amount. Without this
    // sweep the tradie's share is stranded until a human notices.
    //
    // The idempotency key is the same one resolve-dispute-split uses, so a retry
    // can never produce a second payout for the same dispute.
    let splitsCompleted = 0;
    try {
      const { data: pendingSplits } = await supabase
        .from("payments")
        .select("id, job_id, metadata")
        .eq("status", "released")
        .not("metadata->>split_payout_cents", "is", null)
        .is("metadata->>payout_id", null)
        .limit(50);

      for (const row of (pendingSplits || [])) {
        const sm = (row.metadata || {}) as Record<string, unknown>;
        const owed = frozenCents(sm.split_payout_cents);
        const disputeId = typeof sm.split_dispute_id === "string" ? sm.split_dispute_id : null;
        if (owed <= 0 || !disputeId) continue;

        const { data: sJob } = await supabase
          .from("jobs").select("tradie_id").eq("id", row.job_id).maybeSingle();
        const sTradieId = (sJob as { tradie_id: string | null } | null)?.tradie_id;
        if (!sTradieId) continue;

        const { data: sProfile } = await supabase
          .from("profiles").select("stripe_connect_account_id").eq("id", sTradieId).maybeSingle();
        const acct = (sProfile as { stripe_connect_account_id: string | null } | null)
          ?.stripe_connect_account_id;
        if (!acct) continue;

        // Only attempt when the funds are actually AVAILABLE. Firing blindly
        // just re-logs the same failure every six hours and buries real ones.
        try {
          const bal = await stripe.balance.retrieve({ stripeAccount: acct });
          const availableAud = (bal.available || [])
            .filter((b) => b.currency === "aud")
            .reduce((s, b) => s + b.amount, 0);
          if (availableAud < owed) continue;

          const payout = await stripe.payouts.create(
            {
              amount: owed,
              currency: "aud",
              metadata: {
                payment_id: row.id,
                job_id: row.job_id ?? "",
                dispute_id: disputeId,
                flow: "destination",
                leg: "dispute_split_payout_retry",
              },
            },
            { stripeAccount: acct, idempotencyKey: `dispute_split_payout_${disputeId}` },
          );

          // Was an inline destructure of two keys; markPayoutFailed now writes
          // four, and a hand-rolled strip here would silently leave the new ones
          // behind on a row it just paid out.
          const restMeta = clearPayoutFailure(sm);
          await supabase
            .from("payments")
            .update({
              metadata: {
                ...restMeta,
                payout_id: payout.id,
                split_payout_completed_at: new Date().toISOString(),
              },
            })
            .eq("id", row.id);

          splitsCompleted++;
          console.info(`Completed stranded dispute-split payout ${payout.id} (${owed}c) for payment ${row.id}`);
        } catch (splitErr) {
          const m = splitErr instanceof Error ? splitErr.message : String(splitErr);
          console.error(`Split payout retry failed for payment ${row.id}:`, m);
          errors.push(`Split payout ${row.id}: ${m}`);
          await recordPayoutFailure(supabase, row.id, sm, m);
        }
      }
    } catch (sweepErr) {
      // Never let the sweep break the primary release run.
      console.error("Split payout sweep failed:", sweepErr);
    }

    return jsonResponse({
      released,
      total_amount: totalAmount,
      total_amount_dollars: `$${(totalAmount / 100).toFixed(2)}`,
      split_payouts_completed: splitsCompleted,
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
