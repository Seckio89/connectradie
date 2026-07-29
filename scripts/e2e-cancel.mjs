#!/usr/bin/env node
/**
 * ConnecTradie — cancel a funded job, Stripe TEST mode only.
 *
 * process-refund has always issued the refund correctly. What it never did was
 * end the job: a refunded job stayed 'accepted'/'funded', so the client thought
 * they had cancelled while the tradie still had the work booked in. It now sets
 * jobs.status='cancelled' and notifies the counterparty.
 *
 * What it proves, in order of how much it matters:
 *
 *  1. THE CLIENT GETS ALL OF IT BACK. Base + GST + processing fee, asserted
 *     against Stripe's own refund object, not against our row. Under-refunding
 *     is money quietly kept.
 *  2. The job actually ends. jobs.status='cancelled' is the whole point of the
 *     change and the thing that had no coverage.
 *  3. The tradie is told. Silence is how someone turns up to a cancelled job.
 *  4. A SECOND CANCEL DOES NOT REFUND TWICE. process-refund pins the
 *     idempotency key to `refund_${paymentId}`, so a retry must be refused or
 *     return the same refund — never a second one.
 *  5. Post-release cancellation is REFUSED. Once release is approved the funds
 *     are the tradie's; the terms say that is a dispute, and a 409 is what the
 *     UI escalates on. If this ever returned 200 a client could claw back paid
 *     work with no review.
 *
 * Consumes a fresh quote:
 *   npm run e2e:quote     # then put the printed id in .env.e2e
 *   npm run e2e:cancel
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
};

if (!CFG.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key (sk_test_). This harness is test-mode only.");
  process.exit(1);
}

// This script issues REFUNDS. Against the live project those are real.
const PROD_PROJECT_REF = "uoqygmizupdpanplpvor";
for (const [name, value] of Object.entries({ SUPABASE_URL: CFG.SUPABASE_URL, FUNCTIONS_BASE: CFG.FUNCTIONS_BASE })) {
  if (value?.includes(PROD_PROJECT_REF)) {
    console.error(`REFUSING TO RUN: ${name} points at the PRODUCTION project (${PROD_PROJECT_REF}).`);
    process.exit(1);
  }
}

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

/** Fund via PaymentIntent — job_funding has a payment_intent.succeeded fallback. */
async function fundJob(paymentId) {
  const { data: row, error } = await admin
    .from("payments")
    .select("id, job_id, amount, processing_fee, stripe_checkout_session_id, metadata")
    .eq("id", paymentId)
    .single();
  if (error || !row) throw new Error(`payments row ${paymentId} not readable: ${error?.message}`);

  const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
  const destination = row.metadata?.tradie_stripe_account;
  const applicationFee = row.metadata?.platform_fee;

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
      payment_type: "job_funding",
      flow: "destination",
      job_id: row.job_id ?? "",
      tradie_id: row.metadata?.tradie_id ?? "",
    },
  });
  if (pi.status !== "succeeded") throw new Error(`PaymentIntent ${pi.id} status=${pi.status}`);
  await stripe.checkout.sessions.expire(row.stripe_checkout_session_id).catch(() => {});
  return { pi, row, sessionTotal: session.amount_total };
}

(async () => {
  console.log("── ConnecTradie cancel-a-funded-job (test mode) ──");
  const jwt = await signInClient();

  const accept = await callFn("accept-and-pay", jwt, {
    quoteId: CFG.QUOTE_ID, successUrl: CFG.SUCCESS_URL, cancelUrl: CFG.CANCEL_URL,
    idempotencyKey: "e2e_cancel_accept_" + CFG.QUOTE_ID,
    ...(CFG.AGREED_PRICE ? { agreedPrice: CFG.AGREED_PRICE } : {}),
  });
  if (accept.status !== 200 || !accept.json.url) return fail("accept-and-pay: " + JSON.stringify(accept.json));
  const paymentId = accept.json.paymentId;

  const { pi, sessionTotal } = await fundJob(paymentId);
  ok(`escrow funded via ${pi.id} — charged ${money(sessionTotal)}`);

  const funded = await poll("payments.status='completed'", async () => {
    const { data } = await admin.from("payments").select("id,status,job_id,amount,processing_fee,metadata").eq("id", paymentId).maybeSingle();
    return data?.status === "completed" ? data : null;
  });
  const jobId = funded.job_id;
  const { data: tradieRow } = await admin.from("jobs").select("tradie_id, status").eq("id", jobId).single();
  ok(`job ${jobId} funded (status '${tradieRow.status}')`);

  // ── Cancel ───────────────────────────────────────────────────────────────
  const cancel = await callFn("process-refund", jwt, {
    paymentId,
    reason: "E2E: client cancelled before work started",
  });
  if (cancel.status !== 200) return fail(`process-refund ${cancel.status}: ${JSON.stringify(cancel.json)}`);
  ok(`process-refund → refund ${cancel.json.refundId}`);

  // 1. Full amount back, per Stripe.
  const refund = await stripe.refunds.retrieve(cancel.json.refundId);
  const gstCents = funded.metadata?.gst != null ? (parseInt(String(funded.metadata.gst), 10) || 0) : 0;
  const expected = funded.amount + gstCents + (funded.processing_fee || 0);
  if (refund.amount !== expected) {
    fail(`refunded ${money(refund.amount)}, expected ${money(expected)} (base ${money(funded.amount)} + GST ${money(gstCents)} + processing ${money(funded.processing_fee || 0)})`);
  } else {
    ok(`Stripe refunded the full ${money(refund.amount)} — base + GST + processing fee`);
  }
  if (refund.status !== "succeeded" && refund.status !== "pending") {
    fail(`refund status is '${refund.status}'`);
  }

  // 2. Payment marked refunded.
  const { data: afterPay } = await admin.from("payments").select("status").eq("id", paymentId).single();
  if (afterPay.status !== "refunded") fail(`payments.status is '${afterPay.status}', expected 'refunded'`);
  else ok("payments.status='refunded'");

  // 3. The job actually ended — the change this script exists for.
  const cancelled = await poll("jobs.status='cancelled'", async () => {
    const { data } = await admin.from("jobs").select("status").eq("id", jobId).maybeSingle();
    return data?.status === "cancelled" ? data : null;
  }, { tries: 10, delayMs: 1000 }).catch(() => null);
  if (!cancelled) fail("job did NOT become 'cancelled' — it still reads as live to both sides");
  else ok("jobs.status='cancelled'");

  // 4. The tradie was told.
  const { data: notif } = await admin
    .from("notifications")
    .select("id, type, user_id")
    .eq("job_id", jobId)
    .eq("type", "job_cancelled")
    .maybeSingle();
  if (!notif) fail("no job_cancelled notification — the tradie is never told");
  else if (notif.user_id !== tradieRow.tradie_id) fail(`cancellation notice went to ${notif.user_id}, not the tradie`);
  else ok("tradie notified");

  // 5. A second cancel must not refund twice.
  const before = (await stripe.refunds.list({ payment_intent: pi.id, limit: 10 })).data.length;
  const again = await callFn("process-refund", jwt, { paymentId, reason: "E2E: duplicate attempt" });
  const after = (await stripe.refunds.list({ payment_intent: pi.id, limit: 10 })).data.length;
  if (after !== before) {
    fail(`SECOND REFUND ISSUED — ${before} → ${after} refunds on ${pi.id}. The client was paid back twice.`);
  } else {
    ok(`second cancel issued no further refund (HTTP ${again.status}, still ${after} refund on the charge)`);
  }

  // ── Post-release cancellation must be refused ────────────────────────────
  const q2 = process.env.E2E_QUOTE_ID_2;
  if (!q2) {
    info("skipping the post-release case — set E2E_QUOTE_ID_2 to a second fresh quote to cover it");
  } else {
    const accept2 = await callFn("accept-and-pay", jwt, {
      quoteId: q2, successUrl: CFG.SUCCESS_URL, cancelUrl: CFG.CANCEL_URL,
      idempotencyKey: "e2e_cancel_accept2_" + q2,
    });
    if (accept2.status !== 200) return fail("second accept-and-pay: " + JSON.stringify(accept2.json));
    const paymentId2 = accept2.json.paymentId;
    await fundJob(paymentId2);
    const funded2 = await poll("second payment completed", async () => {
      const { data } = await admin.from("payments").select("id,status,job_id,metadata").eq("id", paymentId2).maybeSingle();
      return data?.status === "completed" ? data : null;
    });

    // Stand in for the client having approved release.
    await admin.from("payments").update({
      metadata: { ...(funded2.metadata || {}), release_approved_at: new Date().toISOString() },
    }).eq("id", paymentId2);

    const refused = await callFn("process-refund", jwt, { paymentId: paymentId2, reason: "E2E: after release" });
    if (refused.status !== 409) {
      fail(`post-release cancel returned ${refused.status}, expected 409 — a client could claw back released work`);
    } else {
      ok("post-release cancel refused with 409 (routes to a dispute)");
    }
    const { data: job2 } = await admin.from("jobs").select("status").eq("id", funded2.job_id).single();
    if (job2.status === "cancelled") fail("refused cancel still marked the job cancelled");
    else ok(`job left as '${job2.status}' after the refusal`);
  }

  console.log(process.exitCode ? "\n── FAILED ──" : "\n── PASSED ──");
})().catch((e) => { console.error("❌ " + (e?.message || e)); process.exit(1); });
