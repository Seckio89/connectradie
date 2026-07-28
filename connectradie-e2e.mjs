#!/usr/bin/env node
/**
 * ConnecTradie — Stripe test-mode E2E harness
 * Drives the REAL edge functions (accept-and-pay → checkout → webhook → release-escrow → refund)
 * against a TEST Supabase project + TEST Stripe keys, and asserts the money split.
 *
 * Prereqs (all TEST mode — never live):
 *   npm i stripe @supabase/supabase-js playwright
 *   npx playwright install chromium   # (in this sandbox Chromium is already present)
 *
 * Seed data required in the test project:
 *   - a CLIENT auth user (email+password) that owns a job with an accepted-able quote
 *   - a TRADIE profile with stripe_connect_account_id set + onboarding_complete = true
 *   - a QUOTE id in a payable status (pending / final_submitted)
 *
 * Fill the CONFIG block, then: node connectradie-e2e.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Config comes from .env.e2e (preferred) then .env. No dependency; real env vars
// always win, so any single value can be overridden inline.
for (const file of [".env.e2e", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

// ─────────────── CONFIG (test mode only) ───────────────
const CFG = {
  SUPABASE_URL:        process.env.E2E_SUPABASE_URL        || process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:   process.env.E2E_SUPABASE_ANON_KEY   || process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY:process.env.E2E_SUPABASE_SERVICE_KEY|| process.env.SUPABASE_SERVICE_KEY,
  STRIPE_SECRET_KEY:   process.env.E2E_STRIPE_SECRET_KEY   || process.env.STRIPE_SECRET_KEY,
  FUNCTIONS_BASE:      process.env.E2E_FUNCTIONS_BASE      || process.env.FUNCTIONS_BASE,
  CLIENT_EMAIL:        process.env.E2E_CLIENT_EMAIL        || "client@test.local",
  CLIENT_PASSWORD:     process.env.E2E_CLIENT_PASSWORD     || "password123",
  QUOTE_ID:            process.env.E2E_QUOTE_ID,
  AGREED_PRICE:        process.env.E2E_AGREED_PRICE ? Number(process.env.E2E_AGREED_PRICE) : undefined,
  SUCCESS_URL:         (process.env.ALLOWED_ORIGIN || "https://connectradie.com") + "/pay/success",
  CANCEL_URL:          (process.env.ALLOWED_ORIGIN || "https://connectradie.com") + "/pay/cancel",
  // The v2.1 split IS now wired into accept-and-pay, so this can be enabled — but
  // only when the seeded quote really is the hot-water case (labour $800 +
  // materials $1,600, free tier, tradie NOT GST-registered). Off by default so a
  // differently-priced seed doesn't produce a misleading red.
  ASSERT_HOTWATER: process.env.E2E_ASSERT_HOTWATER === "1",
};

// ── Guard 1: test keys only ────────────────────────────────────────────────
if (!CFG.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key (sk_test_). This harness is test-mode only.");
  process.exit(1);
}

// ── Guard 2: never point this at production ────────────────────────────────
// This harness creates payments, releases escrow and issues refunds. Running it
// against the live project would do all of that to real records.
const PROD_PROJECT_REF = "uoqygmizupdpanplpvor";
for (const [name, value] of Object.entries({ SUPABASE_URL: CFG.SUPABASE_URL, FUNCTIONS_BASE: CFG.FUNCTIONS_BASE })) {
  if (value?.includes(PROD_PROJECT_REF)) {
    console.error(`REFUSING TO RUN: ${name} points at the PRODUCTION project (${PROD_PROJECT_REF}).`);
    console.error("Seed a separate test project and set E2E_SUPABASE_URL / E2E_FUNCTIONS_BASE.");
    process.exit(1);
  }
}

// ── Guard 3: fail with a useful message, not "Invalid supabaseUrl" ─────────
const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "FUNCTIONS_BASE", "QUOTE_ID"];
const missing = REQUIRED.filter((k) => !CFG[k] || String(CFG[k]).includes("<"));
if (missing.length) {
  console.error("REFUSING TO RUN — missing config:\n" + missing.map((k) => `  • E2E_${k}`).join("\n"));
  console.error(`
Set these against a TEST Supabase project (never production), e.g.:

  export E2E_SUPABASE_URL=https://<test-ref>.supabase.co
  export E2E_SUPABASE_ANON_KEY=...
  export E2E_SUPABASE_SERVICE_KEY=...
  export E2E_FUNCTIONS_BASE=https://<test-ref>.functions.supabase.co
  export E2E_STRIPE_SECRET_KEY=sk_test_...
  export E2E_QUOTE_ID=<a seeded quote in pending/final_submitted>
  export E2E_ASSERT_HOTWATER=1   # only if the seed is labour $800 + materials $1,600

The test project also needs: a client auth user, a tradie profile with
stripe_connect_account_id + onboarding_complete, and the Phase 3 edge functions
DEPLOYED to it (otherwise this validates the old V2 code — see the fee_model
assertion below).`);
  process.exit(1);
}

const stripe = new Stripe(CFG.STRIPE_SECRET_KEY);
const admin = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_KEY);
const fail = (m) => { console.error("❌ " + m); process.exitCode = 1; };
const ok   = (m) => console.log("✅ " + m);
const money = (c) => "$" + (c / 100).toFixed(2);

async function signInClient() {
  const anon = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email: CFG.CLIENT_EMAIL, password: CFG.CLIENT_PASSWORD });
  if (error || !data.session) throw new Error("Client sign-in failed: " + (error?.message || "no session"));
  return data.session.access_token;
}

async function callFn(path, jwt, body) {
  const r = await fetch(`${CFG.FUNCTIONS_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, json };
}

/**
 * Fund the escrow with a PaymentIntent instead of driving Stripe's hosted page.
 *
 * WHY NOT THE BROWSER
 * This used to fill `input[name="cardNumber"]` on checkout.stripe.com. That
 * selector is long gone: Checkout now renders card fields inside Elements
 * IFRAMES, behind a payment-method accordion, with hCaptcha loading alongside.
 * Automating a payment form through bot detection is not something a test suite
 * should be doing, and paying the session over the API is impossible too —
 * `session.payment_intent` stays null until a real customer interacts with the
 * hosted page, so there is nothing to confirm.
 *
 * So the money is moved with a PaymentIntent carrying the metadata
 * stripe-webhook's job_funding fallback matches on. That exercises the real
 * webhook, the real payments row and the real release-escrow path. The only
 * thing it skips is Stripe's own checkout UI, which is not our code.
 *
 * Every figure is READ BACK from what accept-and-pay actually computed rather
 * than recomputed here. If the app's amount and this test's amount ever
 * disagree, release-escrow's payout maths is wrong and the run must fail rather
 * than quietly paper over it.
 */
async function fundViaPaymentIntent(paymentId) {
  const { data: row, error } = await admin
    .from("payments")
    .select("id, stripe_checkout_session_id, metadata")
    .eq("id", paymentId)
    .single();
  if (error || !row) throw new Error(`payments row ${paymentId} not readable: ${error?.message}`);
  if (!row.stripe_checkout_session_id) throw new Error("accept-and-pay did not record a checkout session id");

  // amount_total is the authoritative charge the application built.
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
    payment_method_types: ["card"], // avoids redirect-based methods, so no return_url dance
    payment_method: "pm_card_visa",
    confirm: true,
    transfer_data: { destination },
    application_fee_amount: applicationFee,
    // These two keys are what the webhook's job_funding fallback matches on.
    metadata: {
      payment_record_id: row.id,
      payment_type: "job_funding",
      flow: "destination",
      job_id: row.metadata?.job_id ?? "",
      tradie_id: row.metadata?.tradie_id ?? "",
    },
  });

  if (pi.status !== "succeeded") throw new Error(`PaymentIntent ${pi.id} status=${pi.status}`);

  // The hosted session is now orphaned — close it so the test account does not
  // accumulate open sessions.
  await stripe.checkout.sessions.expire(row.stripe_checkout_session_id).catch(() => {});

  return { pi, successUrl: session.success_url };
}

async function waitForPaymentStatus(paymentId, target, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const { data } = await admin.from("payments").select("id,status,amount,processing_fee,metadata").eq("id", paymentId).maybeSingle();
    if (data?.status === target) return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`payment ${paymentId} never reached status='${target}' (webhook not firing? check stripe listen / endpoint secret)`);
}

(async () => {
  console.log("── ConnecTradie E2E (test mode) ──");
  const jwt = await signInClient();

  // 1. Accept + fund escrow (creates Checkout Session)
  const accept = await callFn("accept-and-pay", jwt, {
    quoteId: CFG.QUOTE_ID, successUrl: CFG.SUCCESS_URL, cancelUrl: CFG.CANCEL_URL,
    idempotencyKey: "e2e_accept_" + CFG.QUOTE_ID, ...(CFG.AGREED_PRICE ? { agreedPrice: CFG.AGREED_PRICE } : {}),
  });
  if (accept.status !== 200 || !accept.json.url) return fail("accept-and-pay: " + JSON.stringify(accept.json));
  const paymentId = accept.json.paymentId;
  ok(`accept-and-pay → paymentId ${paymentId}`);

  // 2. Pay with test card on hosted Checkout
  const { pi, successUrl } = await fundViaPaymentIntent(paymentId);
  ok(`escrow funded via PaymentIntent ${pi.id} (test card)`);
  // Proves accept-and-pay passes successUrl through to Stripe VERBATIM, which is
  // the mechanism behind the /payment-success fix. Note this echoes the URL THIS
  // harness supplied (CFG.SUCCESS_URL), not the app's own default — the frontend
  // value is asserted by src/lib/__tests__/paymentFlows.test.ts.
  successUrl === CFG.SUCCESS_URL
    ? ok(`success_url reached Stripe unaltered → ${successUrl}`)
    : fail(`success_url was rewritten: sent ${CFG.SUCCESS_URL}, Stripe has ${successUrl}`);

  // 3. Webhook should flip payment → completed
  const paid = await waitForPaymentStatus(paymentId, "completed");
  ok(`webhook set payment completed (base ${money(paid.amount)}, fee ${money(Number(paid.metadata?.platform_fee)||0)}, gst ${money(Number(paid.metadata?.gst)||0)})`);

  // 3b. DEPLOYMENT CHECK — is this even the v2.1 build?
  // Without this the whole run can pass green against the OLD V2 functions and
  // tell you nothing about the labour/materials cutover.
  if (paid.metadata?.fee_model !== "v2.1") {
    fail(`fee_model is '${paid.metadata?.fee_model ?? "(absent)"}', expected 'v2.1' — the deployed edge functions PREDATE the Phase 3 cutover. Deploy them to this test project first; everything below is validating the old fee model.`);
  } else {
    ok("fee_model=v2.1 — running against the deployed cutover");
    // v2.1 records commission and materials processing separately; they must sum
    // to the total the platform retained, never be blended into one number.
    const commission = Number(paid.metadata?.commission) || 0;
    const matProc = Number(paid.metadata?.materials_processing) || 0;
    const total = Number(paid.metadata?.platform_fee) || 0;
    commission + matProc === total
      ? ok(`split recorded: commission ${money(commission)} + materials processing ${money(matProc)} = ${money(total)}`)
      : fail(`fee components don't reconcile: ${money(commission)} + ${money(matProc)} != ${money(total)}`);
    // The at-cost promise is a published claim — commission must never be levied
    // on the materials portion.
    const mat = Number(paid.metadata?.materials_cents) || 0;
    if (mat > 0 && matProc > Math.round(mat * 0.02)) {
      fail(`materials processing ${money(matProc)} exceeds ~1.93% of materials ${money(mat)} — that is a markup, not at-cost`);
    }
  }
  // metadata.platform_fee must be a NUMBER on the payments row: release-escrow
  // reads it behind a typeof guard and a string silently becomes a 0 fee.
  typeof paid.metadata?.platform_fee === "number"
    ? ok("platform_fee stored as a number (release-escrow reads it correctly)")
    : fail(`platform_fee stored as ${typeof paid.metadata?.platform_fee} — release-escrow's typeof guard will read it as 0 and pay out the full amount`);

  // 4. Release escrow → destination payout to the tradie
  const rel = await callFn("release-escrow", jwt, { paymentId, idempotencyKey: "e2e_release_" + paymentId });
  if (rel.status !== 200) return fail("release-escrow: " + JSON.stringify(rel.json));
  ok(`release-escrow → ${rel.json.payoutId ? "payout " + rel.json.payoutId : rel.json.note}`);

  // 4b. Internal consistency of the split (branch-agnostic):
  //     application_fee retained by platform == platform_fee + processing_fee
  //     tradie balance credit == base + gst − platform_fee
  const acct = paid.metadata?.tradie_stripe_account;
  const base = paid.amount, pf = Number(paid.metadata?.platform_fee)||0, gst = Number(paid.metadata?.gst)||0, proc = paid.processing_fee||0;
  console.log(`   split → base ${money(base)} + gst ${money(gst)} + proc ${money(proc)}; platform keeps ${money(pf+proc)}; tradie nets ${money(base+gst-pf)}`);
  if (CFG.ASSERT_HOTWATER) {
    // v2.1 hot-water: labour $800 + materials $1,600, free tier → tradie net $2,305.12
    (base + gst - pf) === 230512 ? ok("hot-water split verified ($2,305.12 to tradie)")
                                 : fail(`hot-water split mismatch: tradie nets ${money(base+gst-pf)}, expected $2,305.12`);
  }

  // 5. Duplicate-release must NOT create a second payout (double-transfer guard)
  const rel2 = await callFn("release-escrow", jwt, { paymentId, idempotencyKey: "e2e_release_" + paymentId });
  rel2.status === 409 ? ok("duplicate release blocked (409) — no double payout")
                      : fail(`duplicate release returned ${rel2.status} (expected 409). Double-transfer risk — see findings.`);

  // 6. Refund + duplicate-refund (refund-DB-failure guard)
  const ref = await callFn("process-refund", jwt, { paymentId, reason: "e2e test", idempotencyKey: "e2e_refund_" + paymentId });
  if (ref.status === 200) {
    const row = await admin.from("payments").select("status,metadata").eq("id", paymentId).maybeSingle();
    row.data?.status === "refunded" ? ok("refund wrote status='refunded' to DB")
                                    : fail(`refund succeeded in Stripe but DB status='${row.data?.status}' — refund-DB-failure reproduced`);
    const ref2 = await callFn("process-refund", jwt, { paymentId, reason: "dup", idempotencyKey: "e2e_refund_" + paymentId });
    ref2.status === 409 || ref2.status === 400 ? ok("duplicate refund blocked")
                                               : fail(`duplicate refund returned ${ref2.status} — double-refund risk`);
  } else {
    console.log("   (refund path returned " + ref.status + " — expected on destination charge already paid out; check reverse_transfer balance)");
  }

  console.log(process.exitCode ? "\n❌ E2E finished with failures — do NOT flip live." : "\n✅ E2E green.");
})().catch((e) => { fail(e.message); process.exit(1); });
