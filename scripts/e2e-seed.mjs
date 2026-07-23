#!/usr/bin/env node
/**
 * E2E seed helper — prepares a TEST Supabase project for connectradie-e2e.mjs.
 *
 * Three modes, because the setup has two very different lifecycles:
 *
 *   --bootstrap   ONCE per test project. Creates the client auth user, the tradie
 *                 (auth user + profile + tradie_details) and a Stripe TEST Connect
 *                 account. These persist and are reused forever.
 *
 *   --quote       BEFORE EACH RUN (~2s). Creates a fresh job + hot-water quote and
 *                 prints the E2E_QUOTE_ID. Needed every time because the E2E
 *                 CONSUMES its quote: by the end it is accepted, funded, released
 *                 and refunded, and the harness derives its Stripe idempotency
 *                 keys from the quote id — so replaying one returns the original,
 *                 long-expired Checkout session instead of a new one.
 *
 *   --reset       Clears accumulated test jobs/quotes/payments/fee rows. Optional
 *                 housekeeping; leftovers are harmless but they pile up.
 *
 * Required env (TEST project only — never production):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_KEY, E2E_STRIPE_SECRET_KEY (sk_test_)
 * Optional: E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD / E2E_TRADIE_EMAIL
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Config comes from .env.e2e (preferred) then .env. Real env vars always win, so
// you can override any single value inline without editing the file.
for (const file of ['.env.e2e', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CFG = {
  url: process.env.E2E_SUPABASE_URL,
  serviceKey: process.env.E2E_SUPABASE_SERVICE_KEY,
  stripeKey: process.env.E2E_STRIPE_SECRET_KEY,
  clientEmail: process.env.E2E_CLIENT_EMAIL || 'e2e-client@test.local',
  clientPassword: process.env.E2E_CLIENT_PASSWORD || 'e2e-password-123',
  tradieEmail: process.env.E2E_TRADIE_EMAIL || 'e2e-tradie@test.local',
};

const MODE = process.argv.find((a) => ['--bootstrap', '--quote', '--reset'].includes(a));
if (!MODE) {
  console.error('Usage: node scripts/e2e-seed.mjs --bootstrap | --quote | --reset');
  process.exit(1);
}

// ── Guards: this writes data and creates Stripe objects. Never point it at prod.
const PROD_REF = 'uoqygmizupdpanplpvor';
const missing = ['url', 'serviceKey', 'stripeKey'].filter((k) => !CFG[k]);
if (missing.length) {
  console.error(
    'REFUSING TO RUN — missing config:\n' +
      missing.map((k) => `  • E2E_${k === 'url' ? 'SUPABASE_URL' : k === 'serviceKey' ? 'SUPABASE_SERVICE_KEY' : 'STRIPE_SECRET_KEY'}`).join('\n'),
  );
  process.exit(1);
}
if (CFG.url.includes(PROD_REF)) {
  console.error(`REFUSING TO RUN: E2E_SUPABASE_URL points at the PRODUCTION project (${PROD_REF}).`);
  process.exit(1);
}
if (!CFG.stripeKey.startsWith('sk_test_')) {
  console.error('REFUSING TO RUN: E2E_STRIPE_SECRET_KEY is not a test key (sk_test_).');
  process.exit(1);
}

const admin = createClient(CFG.url, CFG.serviceKey, { auth: { persistSession: false } });
const stripe = new Stripe(CFG.stripeKey);
const ok = (m) => console.log('✅ ' + m);
const info = (m) => console.log('   ' + m);

/** Create an auth user, or return the existing one with that email. */
async function ensureUser(email, password) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return created.user;
  // Already exists — find it.
  if (error && !/already/i.test(error.message)) throw new Error(`createUser(${email}): ${error.message}`);
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (!found) throw new Error(`Could not create or find auth user ${email}`);
  return found;
}

async function bootstrap() {
  // ── Client ────────────────────────────────────────────────────────────────
  const client = await ensureUser(CFG.clientEmail, CFG.clientPassword);
  await admin.from('profiles').upsert(
    { id: client.id, email: CFG.clientEmail, full_name: 'E2E Test Client', role: 'client' },
    { onConflict: 'id' },
  );
  ok(`client ${CFG.clientEmail} (${client.id})`);

  // ── Tradie ────────────────────────────────────────────────────────────────
  const tradie = await ensureUser(CFG.tradieEmail, CFG.clientPassword);

  // A Stripe TEST Connect account. Test-mode accounts can be created already
  // capable, so the tradie passes the "finished onboarding" gate that every
  // charge function checks before allowing a destination charge.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('stripe_connect_account_id')
    .eq('id', tradie.id)
    .maybeSingle();

  let acctId = existingProfile?.stripe_connect_account_id;
  if (!acctId) {
    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email: CFG.tradieEmail,
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
    });
    acctId = acct.id;
    info(`created Stripe test Connect account ${acctId}`);
  } else {
    info(`reusing Stripe Connect account ${acctId}`);
  }

  await admin.from('profiles').upsert(
    {
      id: tradie.id,
      email: CFG.tradieEmail,
      full_name: 'E2E Test Tradie',
      role: 'tradie',
      stripe_connect_account_id: acctId,
      stripe_connect_onboarding_complete: true,
      // GST off keeps the hot-water assertion exact: the harness expects the
      // tradie to net $2,305.12, which assumes no GST line is added.
      is_gst_registered: false,
    },
    { onConflict: 'id' },
  );

  await admin.from('tradie_details').upsert(
    { profile_id: tradie.id, subscription_tier: 'free', business_name: 'E2E Plumbing', trade_category: 'plumber' },
    { onConflict: 'profile_id' },
  );
  ok(`tradie ${CFG.tradieEmail} (${tradie.id}) on the FREE tier`);

  console.log(`
Bootstrap complete. Export these once:

  export E2E_CLIENT_EMAIL=${CFG.clientEmail}
  export E2E_CLIENT_PASSWORD=${CFG.clientPassword}

⚠️  The Connect account may still need transfers enabled in the Stripe test
    dashboard before a destination charge will settle. If the E2E fails at
    release with a capability error, enable it there once.

Now run:  node scripts/e2e-seed.mjs --quote`);
}

async function seedQuote() {
  const { data: client } = await admin.from('profiles').select('id').eq('email', CFG.clientEmail).maybeSingle();
  const { data: tradie } = await admin.from('profiles').select('id').eq('email', CFG.tradieEmail).maybeSingle();
  if (!client || !tradie) {
    console.error('Client/tradie profile missing — run --bootstrap first.');
    process.exit(1);
  }

  // The spec's flagship case: $2,400 total = $800 labour + $1,600 materials.
  // Free tier, standard rate → commission $64.00, materials processing $30.88,
  // tradie nets $2,305.12. That is what E2E_ASSERT_HOTWATER=1 checks.
  const LABOUR_CENTS = 80_000;
  const MATERIALS_CENTS = 160_000;
  const TOTAL = (LABOUR_CENTS + MATERIALS_CENTS) / 100;

  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      client_id: client.id,
      description: '[plumbing] E2E hot water system replacement',
      title: 'E2E hot water replacement',
      status: 'pending',
      location_address: '1 Test Street, Sydney NSW 2000',
    })
    .select('id')
    .single();
  if (jobErr) throw new Error(`job insert: ${jobErr.message}`);

  const { data: quote, error: qErr } = await admin
    .from('quotes')
    .insert({
      job_id: job.id,
      tradie_id: tradie.id,
      price_min: TOTAL,
      price_max: TOTAL,
      firm_price: TOTAL,
      message: 'E2E seed — hot water system replacement.',
      status: 'pending',
      includes_materials: true,
      labour_cents: LABOUR_CENTS,
      materials_cents: MATERIALS_CENTS,
      materials_description: 'Rheem 250L electric HWS',
    })
    .select('id')
    .single();
  if (qErr) throw new Error(`quote insert: ${qErr.message}`);

  ok(`job ${job.id}`);
  ok(`quote ${quote.id} — $${TOTAL.toFixed(2)} ($800 labour + $1,600 materials)`);
  console.log(`
Run the E2E with:

  export E2E_QUOTE_ID=${quote.id}
  export E2E_ASSERT_HOTWATER=1
  node connectradie-e2e.mjs
`);
}

async function reset() {
  const { data: tradie } = await admin.from('profiles').select('id').eq('email', CFG.tradieEmail).maybeSingle();
  if (!tradie) {
    console.error('Nothing to reset — run --bootstrap first.');
    process.exit(1);
  }
  const { data: jobs } = await admin.from('jobs').select('id').eq('tradie_id', tradie.id);
  const { data: openJobs } = await admin
    .from('jobs')
    .select('id')
    .is('tradie_id', null)
    .like('description', '%E2E%');
  const jobIds = [...(jobs ?? []), ...(openJobs ?? [])].map((j) => j.id);

  // Order matters — FKs are ON DELETE RESTRICT on the fee tables by design
  // (a tax invoice must not vanish because a payment was tidied away).
  await admin.from('platform_fee_charges').delete().eq('tradie_profile_id', tradie.id);
  await admin.from('platform_fee_invoices').delete().eq('tradie_profile_id', tradie.id);
  if (jobIds.length) {
    await admin.from('payments').delete().in('job_id', jobIds);
    await admin.from('quotes').delete().in('job_id', jobIds);
    await admin.from('jobs').delete().in('id', jobIds);
  }
  ok(`reset: removed ${jobIds.length} job(s) and their quotes/payments/fee rows`);
  info('Stripe test-mode objects are left alone — they cost nothing and keep the audit trail.');
}

const run = MODE === '--bootstrap' ? bootstrap : MODE === '--quote' ? seedQuote : reset;
run().catch((e) => {
  console.error('❌ ' + (e?.message ?? e));
  process.exit(1);
});
