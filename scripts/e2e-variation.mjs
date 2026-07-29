#!/usr/bin/env node
/**
 * ConnecTradie — variation funding, Stripe TEST mode only.
 *
 * Approving a variation used to be two client-side writes: flip
 * job_variations.status to 'approved' and add the amount to jobs.budget_amount.
 * No money was collected. The job became worth more than had been funded and
 * the tradie was owed an amount nobody had charged.
 *
 * Approval now routes through approve-variation -> pay-price-increase ->
 * Stripe, and stripe-webhook is the only thing that approves the variation.
 * This drives that path end to end so the first real variation is not the
 * first execution of it.
 *
 * What it proves, in order of how much it matters:
 *
 *  1. THE BUDGET DOES NOT MOVE UNTIL THE MONEY DOES. Asserted twice: after
 *     approve-variation stamps pending_increase, and again after the checkout
 *     session exists but before it is paid. If either fires, the job is worth
 *     more than is funded and the whole change was pointless.
 *  2. Once the top-up settles, the webhook flips the variation to 'approved'
 *     and raises the budget by the variation's own amount. There is no
 *     accepted quote to read a final price from, so this branch is new code.
 *  3. Units. job_variations.additional_amount and jobs.budget_amount are
 *     DOLLARS; payments.amount is CENTS. A confusion here is a 100x error on
 *     real money, so the charged amount is asserted in cents explicitly.
 *  4. A second variation while one is awaiting payment is REJECTED.
 *     pending_increase is a single slot on the payment; two in flight would
 *     silently overwrite each other and the client would pay one while the
 *     other waited forever.
 *
 * Consumes a fresh quote:
 *   npm run e2e:quote     # then put the printed id in .env.e2e
 *   npm run e2e:variation
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
  // Dollars, as stored on job_variations.additional_amount.
  VARIATION_AMOUNT:     Number(process.env.E2E_VARIATION_AMOUNT || 1200),
};

// ── Guard 1: test keys only ────────────────────────────────────────────────
if (!CFG.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key (sk_test_). This harness is test-mode only.");
  process.exit(1);
}

// ── Guard 2: never point this at production ────────────────────────────────
const PROD_PROJECT_REF = "uoqygmizupdpanplpvor";
for (const [name, value] of Object.entries({ SUPABASE_URL: CFG.SUPABASE_URL, FUNCTIONS_BASE: CFG.FUNCTIONS_BASE })) {
  if (value?.includes(PROD_PROJECT_REF)) {
    console.error(`REFUSING TO RUN: ${name} points at the PRODUCTION project (${PROD_PROJECT_REF}).`);
    process.exit(1);
  }
}

// ── Guard 3: config ────────────────────────────────────────────────────────
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "FUNCTIONS_BASE", "QUOTE_ID"];
const missing = REQUIRED.filter((k) => !CFG[k] || String(CFG[k]).includes("<"));
if (missing.length) {
  console.error("REFUSING TO RUN — missing config:\n" + missing.map((k) => `  • E2E_${k}`).join("\n"));
  console.error("\nMint a fresh quote first:  npm run e2e:quote");
  process.exit(1);
}

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

async function poll(label, fn, { tries = 45, delayMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`timed out waiting for ${label} (${(tries * delayMs) / 1000}s)`);
}

/**
 * Fund a payments row via PaymentIntent rather than the browser. Mirrors
 * fundViaPaymentIntent() in connectradie-e2e.mjs — the metadata keys are what
 * the webhook matches on, so they must stay in step with it.
 */
async function fundPayment(paymentId, { paymentType }) {
  const { data: row, error } = await admin
    .from("payments")
    .select("id, job_id, amount, stripe_checkout_session_id, metadata")
    .eq("id", paymentId)
    .single();
  if (error || !row) throw new Error(`payments row ${paymentId} not readable: ${error?.message}`);
  if (!row.stripe_checkout_session_id) throw new Error("no checkout session id recorded");

  const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
  const destination = row.metadata?.tradie_stripe_account;
  const applicationFee = row.metadata?.platform_fee;
  if (!destination) throw new Error("payments.metadata.tradie_stripe_account missing");

  const pi = await stripe.paymentIntents.create({
    amount: session.amount_total,
    currency: session.currency ?? "aud",
    payment_method_types: ["card"],
    payment_method: "pm_card_bypassPending",
    confirm: true,
    transfer_data: { destination },
    ...(typeof applicationFee === "number" ? { application_fee_amount: applicationFee } : {}),
    metadata: {
      payment_record_id: row.id,
      payment_type: paymentType,
      flow: "destination",
      job_id: row.job_id ?? row.metadata?.job_id ?? "",
      tradie_id: row.metadata?.tradie_id ?? "",
      ...(row.metadata?.parent_payment_id ? { parent_payment_id: row.metadata.parent_payment_id } : {}),
      ...(row.metadata?.variation_id ? { variation_id: row.metadata.variation_id } : {}),
    },
  });
  if (pi.status !== "succeeded") throw new Error(`PaymentIntent ${pi.id} status=${pi.status}`);
  await stripe.checkout.sessions.expire(row.stripe_checkout_session_id).catch(() => {});
  return { pi, session, row };
}

/**
 * Complete a Checkout Session the way a browser would, by confirming the
 * session's OWN PaymentIntent.
 *
 * Not interchangeable with fundPayment(). That mints a separate PI, which is
 * fine for job_funding because stripe-webhook has a payment_intent.succeeded
 * fallback for it — but there is no such fallback for price_adjustment, so a
 * hand-rolled PI leaves checkout.session.completed unfired and the variation
 * pending forever. Confirming the session's own intent is what actually
 * happens in production and is the only way this test means anything.
 */
async function completeCheckoutSession(paymentId) {
  const { data: row, error } = await admin
    .from("payments")
    .select("id, job_id, stripe_checkout_session_id")
    .eq("id", paymentId)
    .single();
  if (error || !row) throw new Error(`payments row ${paymentId} not readable: ${error?.message}`);
  if (!row.stripe_checkout_session_id) throw new Error("no checkout session id recorded");

  const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
  if (!session.payment_intent) throw new Error(`session ${session.id} has no payment_intent`);

  const pi = await stripe.paymentIntents.confirm(String(session.payment_intent), {
    payment_method: "pm_card_bypassPending",
  });
  if (pi.status !== "succeeded") throw new Error(`session PaymentIntent ${pi.id} status=${pi.status}`);
  return { pi, session };
}

const budgetOf = async (jobId) => {
  const { data } = await admin.from("jobs").select("budget_amount").eq("id", jobId).single();
  return Number(data?.budget_amount ?? 0);
};

(async () => {
  console.log("── ConnecTradie variation funding (test mode) ──");
  const jwt = await signInClient();

  // 1. Fund the job.
  const accept = await callFn("accept-and-pay", jwt, {
    quoteId: CFG.QUOTE_ID, successUrl: CFG.SUCCESS_URL, cancelUrl: CFG.CANCEL_URL,
    idempotencyKey: "e2e_var_accept_" + CFG.QUOTE_ID,
    ...(CFG.AGREED_PRICE ? { agreedPrice: CFG.AGREED_PRICE } : {}),
  });
  if (accept.status !== 200 || !accept.json.url) return fail("accept-and-pay: " + JSON.stringify(accept.json));
  const fundingPaymentId = accept.json.paymentId;
  const { pi } = await fundPayment(fundingPaymentId, { paymentType: "job_funding" });
  ok(`escrow funded via ${pi.id}`);

  const funded = await poll("payments.status='completed'", async () => {
    const { data } = await admin.from("payments").select("id,status,job_id").eq("id", fundingPaymentId).maybeSingle();
    return data?.status === "completed" ? data : null;
  });
  const jobId = funded.job_id;
  const budgetBefore = await budgetOf(jobId);
  ok(`job ${jobId} funded — budget ${money(Math.round(budgetBefore * 100))}`);

  // 2. Tradie raises a variation. Inserted directly: the tradie-side form is
  //    not what's under test here, the money path is.
  const { data: variation, error: varErr } = await admin
    .from("job_variations")
    .insert({
      job_id: jobId,
      description: "E2E: rot found in subfloor, replace bearer before waterproofing",
      additional_amount: CFG.VARIATION_AMOUNT,
      status: "pending",
      reason_category: "unforeseen",
    })
    .select("id, additional_amount, status")
    .single();
  if (varErr) return fail("could not insert variation: " + varErr.message);
  ok(`variation ${variation.id} raised for $${CFG.VARIATION_AMOUNT} (pending)`);

  // 3. Client approves — which must NOT approve anything yet.
  const approve = await callFn("approve-variation", jwt, { variationId: variation.id });
  if (approve.status !== 200) return fail(`approve-variation ${approve.status}: ${JSON.stringify(approve.json)}`);
  info(`approve-variation → paymentId ${approve.json.paymentId}, diff ${money(approve.json.diffCents)}`);

  // ASSERTION 1 — the whole point of the change.
  const expectedCents = Math.round(CFG.VARIATION_AMOUNT * 100);
  if (approve.json.diffCents !== expectedCents) {
    fail(`UNITS BUG: variation of $${CFG.VARIATION_AMOUNT} priced as ${approve.json.diffCents} cents, expected ${expectedCents}`);
  } else {
    ok(`dollars→cents conversion correct (${expectedCents} cents)`);
  }

  const { data: afterStamp } = await admin
    .from("job_variations").select("status").eq("id", variation.id).single();
  const budgetAfterStamp = await budgetOf(jobId);
  if (afterStamp.status !== "pending") {
    fail(`variation is '${afterStamp.status}' after approve-variation — it must stay pending until paid`);
  } else if (budgetAfterStamp !== budgetBefore) {
    fail(`budget moved from ${budgetBefore} to ${budgetAfterStamp} before payment — job now worth more than is funded`);
  } else {
    ok("nothing approved and budget unmoved after approve-variation");
  }

  // ASSERTION 4 — a second variation cannot clobber the pending slot.
  const { data: second } = await admin
    .from("job_variations")
    .insert({ job_id: jobId, description: "E2E: second variation", additional_amount: 250, status: "pending" })
    .select("id").single();
  const clash = await callFn("approve-variation", jwt, { variationId: second.id });
  if (clash.status !== 409) {
    fail(`second concurrent variation returned ${clash.status}, expected 409 — pending_increase would be overwritten`);
  } else {
    ok("second variation while one is awaiting payment → 409");
  }
  await admin.from("job_variations").delete().eq("id", second.id);

  // 4. Client pays the top-up.
  const pay = await callFn("pay-price-increase", jwt, {
    paymentId: approve.json.paymentId,
    successUrl: CFG.SUCCESS_URL,
    cancelUrl: CFG.CANCEL_URL,
    idempotencyKey: "e2e_var_pay_" + variation.id,
  });
  if (pay.status !== 200 || !pay.json.url) return fail(`pay-price-increase ${pay.status}: ${JSON.stringify(pay.json)}`);
  const topUpPaymentId = pay.json.paymentId;

  // ASSERTION 1 again — a checkout exists but is unpaid.
  const budgetAtCheckout = await budgetOf(jobId);
  if (budgetAtCheckout !== budgetBefore) {
    fail(`budget moved to ${budgetAtCheckout} once checkout existed but before payment`);
  } else {
    ok("budget still unmoved with an unpaid checkout open");
  }

  // Paid via PaymentIntent, which exercises the payment_intent.succeeded
  // fallback rather than checkout.session.completed. That is deliberate: a
  // Checkout Session has no payment_intent until a browser starts paying it and
  // Stripe offers no API to complete one, so this is the only path a harness
  // can drive — and it is the path that had no handler at all until now.
  const { pi: topUpPi, session: topUpSession } = await fundPayment(topUpPaymentId, { paymentType: "price_adjustment" });
  info(`top-up charged ${money(topUpSession.amount_total)} via ${topUpPi.id}`);

  // 5. The webhook approves it. This branch is the new code.
  const approved = await poll("variation status='approved'", async () => {
    const { data } = await admin.from("job_variations").select("status").eq("id", variation.id).maybeSingle();
    return data?.status === "approved" ? data : null;
  }, { tries: 60 });
  ok("webhook approved the variation");

  // Polled, not read once. The variation flip and the budget update are two
  // separate writes inside applyPriceAdjustment, so 'approved' becoming visible
  // does not mean the budget has landed yet.
  const expectedBudget = budgetBefore + CFG.VARIATION_AMOUNT;
  const budgetAfter = await poll("budget to rise", async () => {
    const b = await budgetOf(jobId);
    return Math.abs(b - expectedBudget) <= 0.005 ? b : null;
  }, { tries: 15, delayMs: 1000 }).catch(() => null);

  if (budgetAfter === null) {
    fail(`budget is ${await budgetOf(jobId)}, expected ${expectedBudget} (was ${budgetBefore} + ${CFG.VARIATION_AMOUNT})`);
  } else {
    ok(`budget rose by exactly the variation amount → ${expectedBudget}`);
  }

  // 6. The pending slot is released for the next variation.
  const { data: parent } = await admin.from("payments").select("metadata").eq("id", approve.json.paymentId).single();
  if (parent?.metadata?.pending_increase) {
    fail("pending_increase still set after completion — the next variation would 409 forever");
  } else {
    ok("pending_increase cleared");
  }

  // 7. Reconciler recovery — the safety net for a webhook that never arrives.
  //
  // Rewind to exactly the stranded state: payment 'pending' with no PI id (only
  // the webhook writes that column), variation back to 'pending', budget back,
  // pending_increase re-held. That is what a dropped checkout.session.completed
  // leaves behind, and until now nothing could see it — reconcile-payments
  // filters on `stripe_payment_intent_id is not null`, so the row was invisible
  // to the very job meant to catch it.
  const topUpPiId = topUpPi.id;
  await admin.from("payments")
    .update({ status: "pending", completed_at: null, stripe_payment_intent_id: null })
    .eq("id", topUpPaymentId);
  await admin.from("job_variations").update({ status: "pending" }).eq("id", variation.id);
  await admin.from("jobs").update({ budget_amount: budgetBefore }).eq("id", jobId);
  const { data: parentNow } = await admin.from("payments").select("metadata").eq("id", approve.json.paymentId).single();
  const rewound = { ...(parentNow.metadata || {}) };
  delete rewound.increase_completed;
  delete rewound.increase_completed_at;
  rewound.pending_increase = {
    diff_cents: expectedCents,
    additional_gst: approve.json.gstCents ?? 0,
    additional_processing_fee: 0,
    additional_platform_fee: 0,
    requested_at: new Date().toISOString(),
    variation_id: variation.id,
  };
  await admin.from("payments").update({ metadata: rewound }).eq("id", approve.json.paymentId);
  info(`rewound to the stranded state (payment pending, PI id cleared, budget ${budgetBefore})`);

  const rec = await callFn("reconcile-payments", CFG.SUPABASE_SERVICE_KEY, {});
  if (rec.status !== 200) {
    fail(`reconcile-payments ${rec.status}: ${JSON.stringify(rec.json)}`);
  } else {
    const { data: recPay } = await admin.from("payments").select("status, stripe_payment_intent_id").eq("id", topUpPaymentId).single();
    const { data: recVar } = await admin.from("job_variations").select("status").eq("id", variation.id).single();
    const recBudget = await budgetOf(jobId);
    const { data: recParent } = await admin.from("payments").select("metadata").eq("id", approve.json.paymentId).single();

    if (recPay.status !== "completed" || recPay.stripe_payment_intent_id !== topUpPiId) {
      fail(`reconciler left payment status='${recPay.status}' pi=${recPay.stripe_payment_intent_id}`);
    } else if (recVar.status !== "approved") {
      fail(`reconciler completed the payment but left the variation '${recVar.status}' — the wedge would be hidden, not fixed`);
    } else if (Math.abs(recBudget - expectedBudget) > 0.005) {
      fail(`reconciler left budget at ${recBudget}, expected ${expectedBudget}`);
    } else if (recParent?.metadata?.pending_increase) {
      fail("reconciler did not clear pending_increase — future increases would still 409");
    } else {
      ok("reconciler recovered a stranded adjustment: payment completed, variation approved, budget raised, slot released");
    }
  }

  console.log(approved && process.exitCode ? "\n── FAILED ──" : "\n── PASSED ──");
})().catch((e) => { console.error("❌ " + (e?.message || e)); process.exit(1); });
