// sweep-connect-balance — pays out money that no release path owns.
//
// THE PROBLEM THIS EXISTS FOR
// Escrow in this system IS the manual payout schedule. Every Express account is
// created with settings.payouts.schedule.interval = "manual"
// (stripe-connect-onboarding), and stripe-payout-settings rejects any other
// value, so Stripe never moves a tradie's money to their bank on its own. The
// only routine caller of stripe.payouts.create is the escrow release path, and
// it fires only for payment_type = 'job_funding'.
//
// Every other destination charge therefore credited the tradie's Connect
// balance and stayed there permanently — site-visit call-out fees
// (book-site-visit writes no payments row at all), bonus payments
// (create-bonus-payment, whose notification already promises the tradie the
// funds are "on the way to your payout account"), and the residue between what
// a charge credited and what a release paid out. Found live as $20.19 on a
// screen that said "Ready to pay out" and offered no way to move it.
//
// This sweep is the general answer rather than a payout call bolted onto each
// of those doors: it is the only design that makes a permanently-manual payout
// schedule safe, and it covers the next destination charge somebody adds
// without a payout owner.
//
// WHAT IT WILL NOT SEND
// available − held client escrow − any unsettled refund, and nothing under
// MIN_SWEEP_CENTS. The escrow reserve is fetchEscrowReserveCents — the same
// number instant-payout uses to stop a tradie taking a client's escrowed funds.
// It THROWS on a query failure by contract, and a throw means skip this tradie:
// an error read as "no escrow held" is how client money gets paid out.
//
// Standard payouts only. They are free, and the tradie has not asked to be
// charged an instant fee for money the platform failed to send.
//
// Auth: service-role JWT, same as the other crons. Cron: 30 */6 * * *, half an
// hour behind auto-release-payments so a release always gets first claim on a
// balance it is about to pay out.
//
// Deploy: supabase functions deploy sweep-connect-balance

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { hasServiceRole } from "../_shared/serviceAuth.ts";
import { fetchEscrowReserveCents } from "../_shared/escrowReserve.ts";
import { planBalanceSweep, sweepIdempotencyKey } from "../_shared/balanceSweep.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const formatAud = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface SweptRow {
  tradie_id: string;
  account: string;
  amount_cents: number;
  payout_id: string;
}

// Exported so tests can call it with a fabricated Request. `import.meta.main`
// is true for the runtime entrypoint and false when a test imports this module,
// so importing it does not start a server.
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey || !stripeSecretKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    if (!(await hasServiceRole(req.headers.get("Authorization"), supabaseUrl))) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Optional body for ops:
    //   { dryRun: true }        — report what would be sent, send nothing
    //   { tradieId: "<uuid>" }  — sweep one tradie, for verifying a fix
    let dryRun = false;
    let onlyTradieId: string | null = null;
    try {
      const b = await req.json();
      dryRun = b?.dryRun === true;
      onlyTradieId = typeof b?.tradieId === "string" ? b.tradieId : null;
    } catch { /* cron sends no body */ }

    const supabase = createClient(supabaseUrl, serviceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    let query = supabase
      .from("profiles")
      .select("id, stripe_connect_account_id")
      .not("stripe_connect_account_id", "is", null)
      .eq("stripe_connect_onboarding_complete", true);
    if (onlyTradieId) query = query.eq("id", onlyTradieId);

    const { data: tradies, error: tradiesError } = await query;
    if (tradiesError) {
      return json({ error: `Failed to list connected tradies — ${tradiesError.message}` }, 500);
    }

    const now = Date.now();
    const swept: SweptRow[] = [];
    const errors: string[] = [];
    let skipped = 0;
    let heldBack = 0;

    // Sequential, not Promise.all: a batch of concurrent balance reads and
    // payouts against Stripe is the shape that trips rate limits, and there is
    // nothing here worth racing for.
    for (const tradie of tradies ?? []) {
      const account = tradie.stripe_connect_account_id as string;

      try {
        // The reserve first. If it throws we must not look at the balance at
        // all, let alone pay any of it out.
        const reserveCents = await fetchEscrowReserveCents(supabase, tradie.id);
        const balance = await stripe.balance.retrieve({ stripeAccount: account });
        const plan = planBalanceSweep({ balance, reserveCents });

        if (!plan.send) {
          skipped++;
          if (plan.reason === "below_minimum") {
            // Logged rather than silent: residue that never reaches the
            // threshold is exactly the state this function exists to surface.
            heldBack += plan.freeCents;
            console.info(
              `${account}: holding ${formatAud(plan.freeCents)} — under the sweep minimum`,
            );
          }
          continue;
        }

        if (dryRun) {
          console.info(`${account}: would sweep ${formatAud(plan.amountCents)} (dry run)`);
          swept.push({ tradie_id: tradie.id, account, amount_cents: plan.amountCents, payout_id: "dry_run" });
          continue;
        }

        const payout = await stripe.payouts.create(
          {
            amount: plan.amountCents,
            currency: "aud",
            description: "ConnecTradie balance",
            metadata: { sweep: "true", tradie_id: tradie.id },
          },
          {
            stripeAccount: account,
            idempotencyKey: sweepIdempotencyKey(account, plan.amountCents, now),
          },
        );

        swept.push({ tradie_id: tradie.id, account, amount_cents: plan.amountCents, payout_id: payout.id });
        console.info(`${account}: swept ${formatAud(plan.amountCents)} → ${payout.id}`);

        // Best-effort by contract, the rule recordInstantPayoutFee already
        // follows: the money has moved, and bookkeeping about it must never
        // turn a successful payout into a failure — or, worse, into a retry.
        try {
          const { error: ledgerError } = await supabase.from("payout_sweeps").insert({
            tradie_profile_id: tradie.id,
            stripe_account_id: account,
            payout_id: payout.id,
            amount_cents: plan.amountCents,
            available_cents: plan.availableCents,
            pending_cents: plan.pendingCents,
            reserve_cents: reserveCents,
          });
          if (ledgerError) throw ledgerError;
        } catch (ledgerErr) {
          console.error(`Could not record sweep ${payout.id} for ${account}:`, ledgerErr);
        }
      } catch (err) {
        // One tradie's failure must never end the batch. Stripe's own message
        // is the useful one here — it names the account state (payouts
        // disabled, no external account) that a generic string would hide.
        const message = (err as { raw?: { message?: string } })?.raw?.message ??
          (err instanceof Error ? err.message : String(err));
        console.error(`Sweep failed for ${account}:`, message);
        errors.push(`${account}: ${message}`);
      }
    }

    const summary = {
      checked: (tradies ?? []).length,
      swept: swept.length,
      total_cents: swept.reduce((s, r) => s + r.amount_cents, 0),
      skipped,
      held_back_cents: heldBack,
      errors,
      dry_run: dryRun,
    };

    // Alert on failures only. A quiet run is the normal one, and a sweep that
    // could not send is money still sitting where nobody can see it.
    if (errors.length > 0 && !dryRun) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .or("is_admin.eq.true,role.eq.admin");
      for (const a of admins ?? []) {
        try {
          await supabase.from("notifications").insert({
            user_id: a.id,
            title: "Connect balance sweep failed",
            message:
              `${errors.length} tradie account(s) could not be swept. ` +
              `${swept.length} succeeded (${formatAud(summary.total_cents)}). ` +
              `Check the sweep-connect-balance logs.`,
            type: "payout_reconciliation",
            read: false,
            metadata: summary,
          });
        } catch (e) {
          console.error("Failed to insert admin alert:", e);
        }
      }
    }

    console.info("sweep-connect-balance:", JSON.stringify(summary));
    return json(summary);
  } catch (err) {
    console.error("sweep-connect-balance error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
};

if (import.meta.main) Deno.serve(handler);
