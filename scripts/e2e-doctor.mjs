#!/usr/bin/env node
/**
 * E2E doctor — checks the setup in order and tells you the ONE next thing to do.
 *
 *   npm run e2e:doctor
 *
 * Every check is read-only. It never writes data, never charges anything, and
 * never touches production (it refuses if you point it there).
 *
 * The point: instead of reading an 8-step runbook and guessing which step you're
 * stuck on, run this and it names the next action.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

for (const file of ['.env.e2e', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROD_REF = 'uoqygmizupdpanplpvor';
const E = process.env;
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);

/** Print the next action and stop. One instruction at a time, on purpose. */
function next(step, action, detail) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`NEXT — ${step}\n`);
  console.log(action);
  if (detail) console.log(`\n${detail}`);
  console.log(`${'─'.repeat(64)}\n`);
  process.exit(1);
}

console.log('\nE2E setup check\n');

// ── 1. Config file ───────────────────────────────────────────────────────────
console.log('1. Config');
if (!existsSync('.env.e2e')) {
  fail('.env.e2e not found');
  next(
    'create your config',
    '  cp .env.e2e.example .env.e2e',
    'Then open .env.e2e and fill in the values from your TEST Supabase project\n(Settings → API) and Stripe TEST mode (Developers → API keys).',
  );
}
pass('.env.e2e found');

const required = [
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
  'E2E_SUPABASE_SERVICE_KEY',
  'E2E_FUNCTIONS_BASE',
  'E2E_STRIPE_SECRET_KEY',
];
const blank = required.filter((k) => !E[k] || E[k].includes('REPLACE_WITH') || E[k] === 'sk_test_');
if (blank.length) {
  blank.forEach((k) => fail(`${k} is empty`));
  next('fill in .env.e2e', '  ' + blank.map((k) => `${k}=…`).join('\n  '));
}
pass('all required values set');

// ── 2. Safety ────────────────────────────────────────────────────────────────
console.log('\n2. Safety');
if (E.E2E_SUPABASE_URL.includes(PROD_REF) || (E.E2E_FUNCTIONS_BASE ?? '').includes(PROD_REF)) {
  fail('pointing at PRODUCTION');
  next(
    'use a test project',
    '  Your E2E_SUPABASE_URL / E2E_FUNCTIONS_BASE point at production.',
    'This run creates payments, releases escrow and issues refunds.\nCreate a separate Supabase project and use its ref.',
  );
}
pass('not production');
if (!E.E2E_STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  fail('Stripe key is not a test key');
  next('use a Stripe TEST key', '  E2E_STRIPE_SECRET_KEY must start with sk_test_');
}
pass('Stripe key is test mode');

const admin = createClient(E.E2E_SUPABASE_URL, E.E2E_SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── 3. Schema ────────────────────────────────────────────────────────────────
console.log('\n3. Schema');
const needed = ['profiles', 'jobs', 'quotes', 'payments', 'pricing_tiers', 'platform_fee_charges'];
const absent = [];
for (const t of needed) {
  const { error } = await admin.from(t).select('*', { count: 'exact', head: true });
  if (error) absent.push(t);
}
if (absent.length) {
  absent.forEach((t) => fail(`table "${t}" missing`));
  next(
    'load the schema',
    '  npx supabase db dump --linked -f prod-schema.sql --schema public\n  psql "<TEST_DB_CONNECTION_STRING>" -f prod-schema.sql',
    'Do NOT use `supabase db push` — production has migrations with no local\nfile, so local migrations will not reproduce it.\n\nNo psql? Paste prod-schema.sql into the test project\'s SQL Editor.',
  );
}
pass(`all ${needed.length} expected tables present`);

// Are the v2.1 columns there? (i.e. was the dump taken AFTER the cutover)
const { error: v21Err } = await admin.from('quotes').select('labour_cents').limit(1);
if (v21Err) {
  fail('quotes.labour_cents missing — schema predates Pricing v2.1');
  next('re-dump the schema', '  Your dump was taken before the v2.1 migrations. Repeat step 3.');
}
pass('v2.1 columns present');

// ── 4. Rates ─────────────────────────────────────────────────────────────────
console.log('\n4. Rates');
const { data: tiers } = await admin.from('pricing_tiers').select('id, rate_bps, fee_cap_cents').eq('id', 'free').maybeSingle();
if (!tiers) {
  warn('no "free" pricing tier row — the fee engine falls back to constants');
} else if (tiers.rate_bps !== 800 || tiers.fee_cap_cents !== 50000) {
  warn(`free tier is ${tiers.rate_bps}bps / cap ${tiers.fee_cap_cents}c — expected 800 / 50000 (v2.1)`);
  warn('the E2E asserts on the engine, so this only affects what /pricing displays');
} else {
  pass('free tier on v2.1 rates (8% / $500 cap)');
}

// ── 5. Functions deployed ────────────────────────────────────────────────────
console.log('\n5. Edge functions');
try {
  const res = await fetch(`${E.E2E_FUNCTIONS_BASE}/accept-and-pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${E.E2E_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({}),
  });
  // Any structured response means it's deployed and reachable. 404 = not deployed.
  if (res.status === 404) {
    fail('accept-and-pay returns 404 — not deployed');
    next('deploy the functions', `  npx supabase functions deploy --project-ref <TEST_REF>`);
  }
  pass(`accept-and-pay reachable (HTTP ${res.status})`);
} catch (e) {
  fail(`could not reach ${E.E2E_FUNCTIONS_BASE}`);
  next('check E2E_FUNCTIONS_BASE', `  Expected https://<test-ref>.functions.supabase.co\n  Error: ${e.message}`);
}

// ── 6. Seed data ─────────────────────────────────────────────────────────────
console.log('\n6. Test accounts');
const { data: tradie } = await admin
  .from('profiles')
  .select('id, stripe_connect_account_id, stripe_connect_onboarding_complete')
  .eq('email', E.E2E_TRADIE_EMAIL || 'e2e-tradie@test.local')
  .maybeSingle();
const { data: client } = await admin
  .from('profiles')
  .select('id')
  .eq('email', E.E2E_CLIENT_EMAIL || 'e2e-client@test.local')
  .maybeSingle();

if (!tradie || !client || !tradie.stripe_connect_account_id) {
  fail('test client/tradie not set up');
  next('bootstrap the test accounts', '  npm run e2e:bootstrap');
}
pass('client + tradie exist');
if (!tradie.stripe_connect_onboarding_complete) {
  fail('tradie has not completed Connect onboarding');
  next('fix the Connect account', '  npm run e2e:bootstrap');
}
pass(`tradie Connect account ${tradie.stripe_connect_account_id}`);

// Transfers capability — the usual first-run stumble.
try {
  const stripe = new Stripe(E.E2E_STRIPE_SECRET_KEY);
  const acct = await stripe.accounts.retrieve(tradie.stripe_connect_account_id);
  if (acct.capabilities?.transfers === 'active') {
    pass('Stripe transfers capability active');
  } else {
    warn(`Stripe transfers capability is "${acct.capabilities?.transfers ?? 'missing'}"`);
    warn('release may fail with a capability error — enable transfers on this');
    warn(`account in the Stripe TEST dashboard: ${tradie.stripe_connect_account_id}`);
  }
} catch {
  warn('could not read the Connect account from Stripe (non-fatal)');
}

// ── 7. Quote ─────────────────────────────────────────────────────────────────
console.log('\n7. Quote for this run');
let quoteUsable = false;
if (E.E2E_QUOTE_ID) {
  const { data: q } = await admin
    .from('quotes')
    .select('id, status, labour_cents, materials_cents')
    .eq('id', E.E2E_QUOTE_ID)
    .maybeSingle();
  if (!q) fail(`E2E_QUOTE_ID ${E.E2E_QUOTE_ID} not found`);
  else if (q.status !== 'pending' && q.status !== 'final_submitted') {
    fail(`quote already used (status="${q.status}") — each run needs a fresh one`);
  } else {
    quoteUsable = true;
    pass(`quote ready — $${((q.labour_cents + q.materials_cents) / 100).toFixed(2)} (${q.labour_cents / 100} labour + ${q.materials_cents / 100} materials)`);
  }
} else {
  fail('E2E_QUOTE_ID not set');
}

if (!quoteUsable) {
  next(
    'mint a fresh quote',
    '  npm run e2e:quote',
    'Then put the printed id into .env.e2e as E2E_QUOTE_ID.\nThe E2E consumes its quote, so this is needed before EVERY run.',
  );
}

// ── Ready ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(64)}`);
console.log('Everything checks out. Run it:\n');
console.log('  npm run e2e:run');
console.log(`${'─'.repeat(64)}\n`);
