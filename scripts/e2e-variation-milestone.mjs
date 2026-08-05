#!/usr/bin/env node
/**
 * ConnecTradie — the two variation claims `e2e-variation.mjs` does NOT cover.
 * Stripe TEST mode only.
 *
 * `e2e-variation.mjs` drives the single-funding job end to end and already
 * proves raise -> approve -> settle and decline -> slot freed. It never builds a
 * job with more than one funding row, and it never checks that a variation can
 * be REFUSED, so both of the defects below were invisible to it.
 *
 *  A. MILESTONE JOBS WERE WEDGED. pay-milestone writes one
 *     payment_type='job_funding' row per milestone, so a job with two or more
 *     settled milestones has two or more of them. approve-variation and
 *     decline-variation both fetched that row with .maybeSingle(), which
 *     returns PGRST116 on multiple matches — both functions 500'd with
 *     "Could not load this job's payment" and the client could neither approve
 *     NOR decline. A dead amber block with no way out.
 *
 *     The fix is _shared/selectFundingPayment.ts. Its 8 Deno tests pin the
 *     selection RULE; this pins the thing those tests cannot reach — that
 *     PostgREST, the real query and the real function return 200 on the row
 *     shape that used to break them.
 *
 *  B. A VARIATION COULD BE RAISED AFTER ESCROW WAS RELEASED. The INSERT policy
 *     checked only jobs.status='in_progress', and release does not move a job
 *     off that status. _shared/expireVariations.ts sweeps only AT release, so
 *     one raised afterwards was never swept: a permanently actionable block
 *     whose only outcome was a 400. Migration 20260804120000 adds
 *     job_has_fundable_escrow() to the predicate.
 *
 *     Driven with an ANON-KEY session carrying the tradie's JWT. Service role
 *     bypasses RLS, so it can never prove a policy refuses anything — the same
 *     reason e2e-variation.mjs builds its own anon client.
 *
 * Seeds its own job. The funding rows are written directly rather than paid
 * through Stripe: the defect is a ROW SHAPE (n>1 completed job_funding rows on
 * one job), and driving twelve real milestone checkouts to reproduce it would
 * test pay-milestone, which is not what changed. The rows are shaped exactly as
 * pay-milestone writes them (see its insert at :199).
 *
 *   npm run e2e:variation:milestone
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
  SUPABASE_URL: process.env.E2E_SUPABASE_URL,
  ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY,
  SERVICE_KEY: process.env.E2E_SUPABASE_SERVICE_KEY,
  STRIPE_SECRET_KEY: process.env.E2E_STRIPE_SECRET_KEY,
  FUNCTIONS_BASE: process.env.E2E_FUNCTIONS_BASE,
  CLIENT_EMAIL: process.env.E2E_CLIENT_EMAIL || "e2e-client@test.local",
  CLIENT_PASSWORD: process.env.E2E_CLIENT_PASSWORD || "e2e-password-123",
  // bootstrap creates the tradie with the client's password — see e2e-seed.mjs:94.
  TRADIE_EMAIL: process.env.E2E_TRADIE_EMAIL || "e2e-tradie@test.local",
  MILESTONE_COUNT: Number(process.env.E2E_MILESTONE_COUNT || 3),
  VARIATION_AMOUNT: Number(process.env.E2E_VARIATION_AMOUNT || 450),
};

const PROD_REF = "uoqygmizupdpanplpvor";

// ── Guard 1: test keys only ─────────────────────────────────────────────────
if (!CFG.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("Refusing to run: E2E_STRIPE_SECRET_KEY must start with sk_test_");
  process.exit(1);
}
// ── Guard 2: never point this at production ─────────────────────────────────
if ([CFG.SUPABASE_URL, CFG.FUNCTIONS_BASE].some((u) => (u ?? "").includes(PROD_REF))) {
  console.error("Refusing to run: pointing at PRODUCTION. This seeds jobs and payments.");
  process.exit(1);
}
// ── Guard 3: config ─────────────────────────────────────────────────────────
for (const k of ["SUPABASE_URL", "ANON_KEY", "SERVICE_KEY", "FUNCTIONS_BASE"]) {
  if (!CFG[k]) {
    console.error(`Refusing to run: E2E_${k === "ANON_KEY" ? "SUPABASE_ANON_KEY" : k} is not set`);
    process.exit(1);
  }
}

const admin = createClient(CFG.SUPABASE_URL, CFG.SERVICE_KEY, {
  auth: { persistSession: false },
});

const results = [];
const record = (claim, passed, detail) => {
  results.push({ claim, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${claim}${detail ? `\n        ${detail}` : ""}`);
};

/** An anon-key client carrying a real user's JWT. RLS applies to this one. */
async function signIn(email, password) {
  const c = createClient(CFG.SUPABASE_URL, CFG.ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return { client: c, token: data.session.access_token, userId: data.user.id };
}

async function callFn(path, bearer, body) {
  const res = await fetch(`${CFG.FUNCTIONS_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  let parsed = null;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { /* non-JSON body is itself a finding */ }
  return { status: res.status, body: parsed, raw: text };
}

// ────────────────────────────────────────────────────────────────────────────
async function seedMilestoneJob(clientId, tradieId) {
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .insert({
      client_id: clientId,
      tradie_id: tradieId,
      title: "E2E milestone variation",
      description: "[plumbing] E2E multi-milestone job for variation selection",
      status: "in_progress",
      location_address: "1 Test Street, Sydney NSW 2000",
      budget_amount: 6000,
    })
    .select("id")
    .single();
  if (jobErr) throw new Error(`job insert: ${jobErr.message}`);

  const { data: tradieProfile } = await admin
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", tradieId)
    .maybeSingle();

  // Shaped as pay-milestone/index.ts:199 writes them: no deposit_type, so
  // selectFundingPaymentForTopUp falls through to "most recent", which on a
  // milestone job is the stage being worked now.
  const rows = [];
  for (let i = 1; i <= CFG.MILESTONE_COUNT; i++) {
    rows.push({
      profile_id: clientId,
      payment_type: "job_funding",
      job_id: job.id,
      amount: 200_000,
      processing_fee: 0,
      currency: "aud",
      status: "completed",
      metadata: {
        milestone_id: `e2e-milestone-${i}`,
        milestone_title: `Stage ${i}`,
        flow: "destination",
        tradie_id: tradieId,
        tradie_stripe_account: tradieProfile?.stripe_connect_account_id ?? null,
        e2e: true,
      },
    });
  }
  const { data: payments, error: payErr } = await admin
    .from("payments")
    .insert(rows)
    .select("id");
  if (payErr) throw new Error(`funding rows insert: ${payErr.message}`);

  return { jobId: job.id, paymentIds: payments.map((p) => p.id) };
}

/** Raise a variation as the tradie, through RLS. Returns {id} or {error}. */
async function raiseVariation(tradieClient, jobId, label) {
  const { data, error } = await tradieClient
    .from("job_variations")
    .insert({
      job_id: jobId,
      description: `E2E ${label}`,
      additional_amount: CFG.VARIATION_AMOUNT,
      status: "pending",
      reason_category: "additional_work",
    })
    .select("id")
    .maybeSingle();
  return { id: data?.id, error };
}

// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\nVariation — milestone selection + post-release refusal\n");

  const stripe = new Stripe(CFG.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  const acct = await stripe.accounts.retrieve().catch(() => null);
  console.log(`Stripe test account: ${acct?.id ?? "(unreadable)"}\n`);

  const clientSession = await signIn(CFG.CLIENT_EMAIL, CFG.CLIENT_PASSWORD);
  const tradieSession = await signIn(CFG.TRADIE_EMAIL, CFG.CLIENT_PASSWORD);

  const { jobId, paymentIds } = await seedMilestoneJob(clientSession.userId, tradieSession.userId);
  console.log(`Seeded job ${jobId} with ${paymentIds.length} completed job_funding rows\n`);

  // ── Claim A1: the tradie can raise one while escrow is fundable ───────────
  console.log("A. Milestone job — approve and decline must not 500");
  const raised = await raiseVariation(tradieSession.client, jobId, "milestone approve");
  record(
    "tradie can raise a variation on a funded milestone job",
    Boolean(raised.id),
    raised.error ? `RLS refused: ${raised.error.message}` : `variation ${raised.id}`,
  );
  if (!raised.id) {
    console.log("\nCannot continue — nothing to approve.\n");
    return summarise();
  }

  // ── Claim A2: approve-variation returns 200, not the PGRST116 500 ─────────
  const approve = await callFn("approve-variation", clientSession.token, {
    variationId: raised.id,
  });
  const approveWedged =
    approve.status === 500 && /could not load this job's payment/i.test(approve.raw);
  record(
    "approve-variation returns 200 on a multi-funding job",
    approve.status === 200,
    approveWedged
      ? "THE ORIGINAL DEFECT: 500 \"Could not load this job's payment\" (PGRST116)"
      : `status ${approve.status} — ${approve.raw.slice(0, 220)}`,
  );

  // ── Claim A3: decline-variation likewise ─────────────────────────────────
  // Same variation: approve stamped the pending_increase slot, so this also
  // exercises selectFundingPaymentForVariation finding the row holding it.
  const decline = await callFn("decline-variation", clientSession.token, {
    variationId: raised.id,
  });
  const declineWedged =
    decline.status === 500 && /could not load this job's payment/i.test(decline.raw);
  record(
    "decline-variation returns 200 on a multi-funding job",
    decline.status === 200,
    declineWedged
      ? "THE ORIGINAL DEFECT: 500 \"Could not load this job's payment\" (PGRST116)"
      : `status ${decline.status} — ${decline.raw.slice(0, 220)}`,
  );

  // ── Claim B: once released, RLS must refuse a new variation ──────────────
  console.log("\nB. Post-release — RLS must refuse a new variation");
  const { error: relErr } = await admin
    .from("payments")
    .update({ status: "released" })
    .in("id", paymentIds);
  if (relErr) throw new Error(`release update: ${relErr.message}`);

  const afterRelease = await raiseVariation(tradieSession.client, jobId, "post-release");
  record(
    "RLS refuses a variation once escrow is released",
    !afterRelease.id && Boolean(afterRelease.error),
    afterRelease.id
      ? `THE ORIGINAL DEFECT: insert succeeded (${afterRelease.id}) — migration 20260804120000 is not in effect on this database`
      : `refused: ${afterRelease.error?.message}`,
  );

  // Control: prove the refusal is the escrow predicate and not something
  // incidental. Restore one row to completed and the same insert must succeed —
  // otherwise a broken tradie_id or job status would read as a pass above.
  await admin.from("payments").update({ status: "completed" }).eq("id", paymentIds[0]);
  const control = await raiseVariation(tradieSession.client, jobId, "control");
  record(
    "control: the same insert succeeds again once escrow is fundable",
    Boolean(control.id),
    control.error ? `still refused: ${control.error.message} — the refusal above may not be the escrow predicate` : `variation ${control.id}`,
  );

  summarise();
}

function summarise() {
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${"─".repeat(64)}`);
  console.log(`${results.length - failed.length}/${results.length} claims passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.claim}\n    ${f.detail}`);
  }
  console.log(`${"─".repeat(64)}\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nHarness error (NOT a claim result — nothing was proven):\n  ${err.message}\n`);
  process.exit(2);
});
