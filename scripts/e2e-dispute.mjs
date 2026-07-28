#!/usr/bin/env node
/**
 * ConnecTradie — chargeback (dispute) simulation, Stripe TEST mode only.
 *
 * stripe-webhook's `charge.dispute.closed` handler had never executed once: the
 * production endpoint was not subscribed to the event until 2026-07-28, so the
 * code shipped 2026-07-27 has only ever been read, never run. This drives the
 * full created → closed cycle against the TEST project so the first real
 * chargeback is not the first execution.
 *
 * What it proves, in order of how much it matters:
 *
 *  1. LOST chargeback does not become a payout. `blocks_release` is GENERATED as
 *     status IN ('open','under_review','direct_resolution','platform_review'), so
 *     closing a dispute as `resolved_client` sets it FALSE and auto-release stops
 *     excluding the job. The only remaining guard is payments.status='refunded'.
 *     If that write fails the platform pays the tradie money the client clawed
 *     back. This is the assertion the whole script exists for.
 *
 *  2. WON chargeback does not freeze the tradie forever. Without the closed
 *     handler the disputes row stays 'open' and blocks that payout permanently.
 *
 *  3. The two handlers' hidden coupling. `charge.dispute.closed` matches the
 *     payment on metadata->>stripe_dispute_id — a field only
 *     `charge.dispute.created` writes. If created's lookup chain threw, closed
 *     silently updates ZERO rows and still reports success.
 *
 * Run it twice, once per outcome:
 *   E2E_DISPUTE_OUTCOME=lost npm run e2e:dispute
 *   E2E_DISPUTE_OUTCOME=won  npm run e2e:dispute
 *
 * Each run consumes a fresh quote (`npm run e2e:quote`), because
 * `disputes_one_open_per_job` is UNIQUE on (job_id) WHERE blocks_release.
 */
import { readFileSync, existsSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.e2e", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const CFG = {
  SUPABASE_URL:         process.env.E2E_SUPABASE_URL         || process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:    process.env.E2E_SUPABASE_ANON_KEY    || process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.E2E_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY,
  STRIPE_SECRET_KEY:    process.env.E2E_STRIPE_SECRET_KEY    || process.env.STRIPE_SECRET_KEY,
  FUNCTIONS_BASE:       process.env.E2E_FUNCTIONS_BASE       || process.env.FUNCTIONS_BASE,
  CLIENT_EMAIL:         process.env.E2E_CLIENT_EMAIL         || "client@test.local",
  CLIENT_PASSWORD:      process.env.E2E_CLIENT_PASSWORD      || "password123",
  QUOTE_ID:             process.env.E2E_QUOTE_ID,
  AGREED_PRICE:         process.env.E2E_AGREED_PRICE ? Number(process.env.E2E_AGREED_PRICE) : undefined,
  SUCCESS_URL:          (process.env.ALLOWED_ORIGIN || "https://connectradie.com") + "/pay/success",
  CANCEL_URL:           (process.env.ALLOWED_ORIGIN || "https://connectradie.com") + "/pay/cancel",
  OUTCOME:              (process.env.E2E_DISPUTE_OUTCOME || "").toLowerCase(),
};

// ── Guard 1: test keys only ────────────────────────────────────────────────
if (!CFG.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key (sk_test_). This harness is test-mode only.");
  process.exit(1);
}

// ── Guard 2: never point this at production ────────────────────────────────
// This script deliberately creates a CHARGEBACK. Against the live project that
// would be a real dispute on a real card, with a real fee.
const PROD_PROJECT_REF = "uoqygmizupdpanplpvor";
for (const [name, value] of Object.entries({ SUPABASE_URL: CFG.SUPABASE_URL, FUNCTIONS_BASE: CFG.FUNCTIONS_BASE })) {
  if (value?.includes(PROD_PROJECT_REF)) {
    console.error(`REFUSING TO RUN: ${name} points at the PRODUCTION project (${PROD_PROJECT_REF}).`);
    process.exit(1);
  }
}

// ── Guard 3: config + outcome ──────────────────────────────────────────────
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "FUNCTIONS_BASE", "QUOTE_ID"];
const missing = REQUIRED.filter((k) => !CFG[k] || String(CFG[k]).includes("<"));
if (missing.length) {
  console.error("REFUSING TO RUN — missing config:\n" + missing.map((k) => `  • E2E_${k}`).join("\n"));
  console.error("\nMint a fresh quote first:  npm run e2e:quote");
  process.exit(1);
}
if (!["won", "lost"].includes(CFG.OUTCOME)) {
  console.error("REFUSING TO RUN: set E2E_DISPUTE_OUTCOME=lost or E2E_DISPUTE_OUTCOME=won.");
  console.error("Run both — they exercise opposite branches of charge.dispute.closed.");
  process.exit(1);
}

// `pm_card_createDispute` = 4000000000000259, charge succeeds then is disputed
// as fraudulent. No test card both raises a dispute AND bypasses the pending
// balance, but they do not need to be the same charge: the connected account's
// available balance is topped up separately (see ensureAvailableBalance).
const DISPUTE_TOKEN = process.env.E2E_DISPUTE_TOKEN || "pm_card_createDispute";

const stripe = new Stripe(CFG.STRIPE_SECRET_KEY);
const admin = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_KEY);
const fail = (m) => { console.error("❌ " + m); process.exitCode = 1; };
const ok = (m) => console.log("✅ " + m);
const info = (m) => console.log("   " + m);
const money = (c) => "$" + (c / 100).toFixed(2);

async function signInClient() {
  const anon = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email: CFG.CLIENT_EMAIL, password: CFG.CLIENT_PASSWORD });
  if (error || !data.session) throw new Error("Client sign-in failed: " + (error?.message || "no session"));
  return data.session.access_token;
}

async function callFn(path, bearer, body) {
  const r = await fetch(`${CFG.FUNCTIONS_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, json };
}

/** Poll until fn() returns something truthy, or give up. */
async function poll(label, fn, { tries = 45, delayMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`timed out waiting for ${label} (${(tries * delayMs) / 1000}s)`);
}

/**
 * Fund escrow with the dispute-triggering card. Mirrors fundViaPaymentIntent()
 * in connectradie-e2e.mjs — the metadata keys are what the webhook's job_funding
 * fallback matches on, so they must stay in step with it.
 */
async function fundWithDisputeCard(paymentId) {
  const { data: row, error } = await admin
    .from("payments")
    .select("id, job_id, stripe_checkout_session_id, metadata")
    .eq("id", paymentId)
    .single();
  if (error || !row) throw new Error(`payments row ${paymentId} not readable: ${error?.message}`);
  if (!row.stripe_checkout_session_id) throw new Error("accept-and-pay did not record a checkout session id");

  const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
  const destination = row.metadata?.tradie_stripe_account;
  const applicationFee = row.metadata?.platform_fee;
  if (!destination) throw new Error("payments.metadata.tradie_stripe_account missing");
  if (typeof applicationFee !== "number") {
    throw new Error(`payments.metadata.platform_fee is ${typeof applicationFee}, expected number`);
  }

  const pi = await stripe.paymentIntents.create({
    amount: session.amount_total,
    currency: session.currency ?? "aud",
    payment_method_types: ["card"],
    payment_method: DISPUTE_TOKEN,
    confirm: true,
    transfer_data: { destination },
    application_fee_amount: applicationFee,
    metadata: {
      payment_record_id: row.id,
      payment_type: "job_funding",
      flow: "destination",
      job_id: row.job_id ?? row.metadata?.job_id ?? "",
      tradie_id: row.metadata?.tradie_id ?? "",
    },
  });
  if (pi.status !== "succeeded") throw new Error(`PaymentIntent ${pi.id} status=${pi.status}`);

  await stripe.checkout.sessions.expire(row.stripe_checkout_session_id).catch(() => {});
  return { pi, jobId: row.job_id, destination };
}

/**
 * Ask auto-release-payments to consider ONE job, skipping the 5h cutoff (it
 * accepts { jobId } for exactly this). Needs a service-role key: the function
 * probes the presented key with auth.admin.listUsers rather than byte-comparing.
 */
async function tryAutoRelease(jobId) {
  const r = await callFn("auto-release-payments", CFG.SUPABASE_SERVICE_KEY, { jobId });
  if (r.status !== 200) throw new Error(`auto-release-payments ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json;
}

/** Test-only: make the job eligible for auto-release so the probe is meaningful. */
async function makeJobReleasable(jobId) {
  const { error } = await admin
    .from("jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(`could not mark job ${jobId} completed: ${error.message}`);
}

(async () => {
  console.log(`── ConnecTradie dispute simulation (test mode) — outcome: ${CFG.OUTCOME.toUpperCase()} ──`);
  const jwt = await signInClient();

  // 1. Fund escrow with the dispute card.
  const accept = await callFn("accept-and-pay", jwt, {
    quoteId: CFG.QUOTE_ID, successUrl: CFG.SUCCESS_URL, cancelUrl: CFG.CANCEL_URL,
    idempotencyKey: "e2e_dispute_accept_" + CFG.QUOTE_ID,
    ...(CFG.AGREED_PRICE ? { agreedPrice: CFG.AGREED_PRICE } : {}),
  });
  if (accept.status !== 200 || !accept.json.url) return fail("accept-and-pay: " + JSON.stringify(accept.json));
  const paymentId = accept.json.paymentId;
  ok(`accept-and-pay → paymentId ${paymentId}`);

  const { pi, jobId } = await fundWithDisputeCard(paymentId);
  if (!jobId) return fail("payments row has no job_id — dispute.created cannot derive job context");
  ok(`escrow funded via ${pi.id} using ${DISPUTE_TOKEN} (job ${jobId})`);

  // 2. Webhook completes the payment (job_funding fallback on payment_intent.succeeded).
  const paid = await poll("payments.status='completed'", async () => {
    const { data } = await admin.from("payments").select("id,status,metadata").eq("id", paymentId).maybeSingle();
    return data?.status === "completed" ? data : null;
  });
  ok("webhook set payment completed");

  // 3. Stripe raises the dispute a moment after the charge; the webhook writes
  //    the disputes row. Poll for OUR row, not Stripe's — the row is the thing
  //    auto-release reads, and its absence is the failure that costs money.
  const disputeRow = await poll("disputes row from charge.dispute.created", async () => {
    const { data } = await admin
      .from("disputes")
      .select("id, job_id, opened_by, against_user, reason, status, blocks_release, stripe_dispute_id")
      .eq("job_id", jobId)
      .maybeSingle();
    return data?.stripe_dispute_id ? data : null;
  }, { tries: 60 });
  ok(`dispute recorded: ${disputeRow.stripe_dispute_id} (status=${disputeRow.status})`);

  // ── Assertions on the created side ───────────────────────────────────────
  disputeRow.blocks_release === true
    ? ok("blocks_release=true — auto-release excludes this job")
    : fail(`blocks_release=${disputeRow.blocks_release}, expected true — the chargeback is NOT blocking the payout`);

  String(disputeRow.reason || "").startsWith("stripe_chargeback:")
    ? ok(`reason recorded as ${disputeRow.reason}`)
    : fail(`reason is '${disputeRow.reason}', expected a stripe_chargeback: prefix`);

  const { data: job } = await admin.from("jobs").select("client_id, tradie_id").eq("id", jobId).maybeSingle();
  disputeRow.opened_by === job?.client_id && disputeRow.against_user === job?.tradie_id
    ? ok("dispute attributed correctly (client raised it, tradie is the respondent)")
    : fail(`dispute parties wrong: opened_by=${disputeRow.opened_by} against_user=${disputeRow.against_user}`);

  // THE COUPLING: charge.dispute.closed matches the payment on this field, and
  // only charge.dispute.created writes it. Missing here == the closed handler
  // will update zero rows later and still report success.
  const { data: payAfterCreate } = await admin.from("payments").select("metadata,status").eq("id", paymentId).maybeSingle();
  payAfterCreate?.metadata?.stripe_dispute_id === disputeRow.stripe_dispute_id
    ? ok("payments.metadata.stripe_dispute_id cross-referenced — dispute.closed can find this payment")
    : fail("payments.metadata.stripe_dispute_id NOT set — charge.dispute.closed will silently match zero rows");

  // 4. Probe auto-release WHILE the dispute is live. Must not release.
  await makeJobReleasable(jobId);
  const whileOpen = await tryAutoRelease(jobId);
  whileOpen.released === 0
    ? ok("auto-release refused while the dispute is open (released=0)")
    : fail(`auto-release released ${whileOpen.released} job(s) DESPITE a live dispute — money left escrow during a chargeback`);

  // 5. Force the outcome. In test mode Stripe resolves a dispute on evidence
  //    submission, using these magic strings.
  const evidenceText = CFG.OUTCOME === "won" ? "winning_evidence" : "losing_evidence";
  await stripe.disputes.update(disputeRow.stripe_dispute_id, {
    evidence: { uncategorized_text: evidenceText },
    submit: true,
  });
  info(`submitted ${evidenceText} to ${disputeRow.stripe_dispute_id}`);

  const expectedStatus = CFG.OUTCOME === "won" ? "resolved_tradie" : "resolved_client";
  const closed = await poll(`disputes.status='${expectedStatus}'`, async () => {
    const { data } = await admin
      .from("disputes")
      .select("status, blocks_release, resolved_at, resolution")
      .eq("stripe_dispute_id", disputeRow.stripe_dispute_id)
      .maybeSingle();
    return data?.status === expectedStatus ? data : null;
  }, { tries: 60 });
  ok(`charge.dispute.closed mapped ${CFG.OUTCOME} → ${closed.status}`);

  closed.blocks_release === false
    ? ok("blocks_release cleared — the dispute no longer freezes the job")
    : fail("blocks_release still true after close — this is the never-pay bug: the tradie can never be paid");
  closed.resolved_at ? ok("resolved_at stamped") : fail("resolved_at not set on close");

  // 6. The assertion this script exists for.
  const { data: payAfterClose } = await admin.from("payments").select("status").eq("id", paymentId).maybeSingle();
  if (CFG.OUTCOME === "lost") {
    payAfterClose?.status === "refunded"
      ? ok("LOST chargeback marked the payment refunded")
      : fail(`payment status is '${payAfterClose?.status}', expected 'refunded' — blocks_release is now false, so NOTHING stops auto-release paying out clawed-back funds`);
  } else {
    payAfterClose?.status === "completed"
      ? ok("WON chargeback left the payment completed (still payable)")
      : fail(`payment status is '${payAfterClose?.status}', expected 'completed' — a won dispute must not mark it refunded`);
  }

  // 7. Probe auto-release AFTER the close. Opposite expectations per outcome.
  const afterClose = await tryAutoRelease(jobId);
  if (CFG.OUTCOME === "lost") {
    afterClose.released === 0
      ? ok("auto-release still refuses after a LOST chargeback — clawed-back funds stay put")
      : fail(`auto-release released ${afterClose.released} job(s) after a LOST chargeback — the platform just paid out money the client took back`);
  } else {
    afterClose.released > 0
      ? ok(`auto-release paid the tradie after a WON chargeback (${money(afterClose.total_amount || 0)})`)
      : fail("auto-release released nothing after a WON chargeback — the payout is still frozen");
  }

  console.log(process.exitCode ? "\n── FAILED ──" : "\n── PASSED ──");
})().catch((e) => { console.error("💥 " + (e?.message || e)); process.exit(1); });
