#!/usr/bin/env node
/**
 * e2e-verification — the refusals the unit tests cannot reach, run against a
 * LIVE project (staging or a Supabase branch, never production).
 *
 *   E2E_SUPABASE_URL=… E2E_SUPABASE_ANON_KEY=… E2E_SUPABASE_SERVICE_KEY=… \
 *   E2E_FUNCTIONS_BASE=https://<ref>.supabase.co/functions/v1 \
 *   node scripts/e2e-verification.mjs
 *
 * What it proves (each is a negative test the RLS auditor asks for):
 *   1. tradie A cannot read tradie B's business_verifications row
 *   2. an authenticated user cannot INSERT into business_verifications
 *   3. tradie A cannot read tradie B's licence_verifications row
 *   4. a tradie cannot UPDATE a licence row once it is awaiting_review
 *   5. a tradie cannot flip their own extracted row to 'verified'
 *   6. tradie A cannot read tradie B's licence photo (signed URL refused)
 *   7. a non-admin calling review-licence gets 403
 *   8. extract-licence without a consent row gets 403
 *   9. review-licence (as admin) deletes the storage object in the same call
 *
 * Creates two throwaway users (and promotes a third to admin via is_admin),
 * seeds rows with the service key, runs the checks with each user's JWT, and
 * deletes everything it created. Exits 1 on the first failed assertion.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.E2E_SUPABASE_URL;
const ANON = process.env.E2E_SUPABASE_ANON_KEY;
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY;
const FN = process.env.E2E_FUNCTIONS_BASE || (URL ? `${URL}/functions/v1` : '');

if (!URL || !ANON || !SERVICE) {
  console.log('e2e-verification: E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_KEY not set — skipping (needs a live non-production project).');
  process.exit(0);
}
if (/uoqygmizupdpanplpvor/.test(URL) && process.env.E2E_ALLOW_PROD !== 'yes') {
  console.error('e2e-verification: refusing to run against production. Point it at staging or a branch.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = 'licence-uploads';
let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failures++;
};

async function makeUser(tag, extra = {}) {
  const email = `e2e-verif-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from('profiles').upsert({ id: data.user.id, email, full_name: `E2E ${tag}`, role: 'tradie', onboarding_completed: true, ...extra });
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client, token: session.session.access_token };
}

const callFn = (name, token, body) =>
  fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const created = { users: [], paths: [] };
try {
  console.log('Seeding…');
  const a = await makeUser('a');
  const b = await makeUser('b');
  const adm = await makeUser('admin', { is_admin: true });
  created.users.push(a.id, b.id, adm.id);

  // B's ABN row and licence rows (service role writes; trigger allows it).
  await admin.from('business_verifications').insert({
    user_id: b.id, abn: '51824753556', abn_status: 'Active', entity_name: 'B PTY LTD',
    claimed_business_name: 'B Pty Ltd', name_match: true, status: 'verified',
  }).throwOnError();

  const photoPath = `${b.id}/${randomUUID()}.jpg`;
  created.paths.push(photoPath);
  const { error: upErr } = await admin.storage.from(BUCKET).upload(photoPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  if (upErr) throw upErr;

  const { data: awaiting } = await admin.from('licence_verifications').insert({
    user_id: b.id, trade_category: 'plumber', state_code: 'NSW', storage_path: photoPath,
    licence_number: '123456C', licence_holder_name: 'E2E b', licence_class: 'Plumber', expiry_date: '2030-01-01',
    status: 'awaiting_review',
  }).select('id').single().throwOnError();

  const { data: draft } = await admin.from('licence_verifications').insert({
    user_id: a.id, trade_category: 'electrician', state_code: 'QLD', status: 'extracted',
  }).select('id').single().throwOnError();

  console.log('Checks…');
  // 1
  const r1 = await a.client.from('business_verifications').select('id').eq('user_id', b.id);
  check(!r1.error && r1.data.length === 0, 'tradie A cannot read tradie B business_verifications row');
  // 2
  const r2 = await a.client.from('business_verifications').insert({ user_id: a.id, abn: '51824753556', abn_status: 'Active', claimed_business_name: 'x', status: 'verified' });
  check(!!r2.error, `authenticated user cannot INSERT business_verifications (${r2.error?.code ?? 'no error!'})`);
  // 3
  const r3 = await a.client.from('licence_verifications').select('id').eq('user_id', b.id);
  check(!r3.error && r3.data.length === 0, 'tradie A cannot read tradie B licence_verifications row');
  // 4
  const r4 = await b.client.from('licence_verifications').update({ licence_number: 'HACKED' }).eq('id', awaiting.id).select('id');
  check((r4.error || r4.data.length === 0), 'tradie cannot UPDATE a row once awaiting_review');
  // 5
  const r5 = await a.client.from('licence_verifications').update({ status: 'verified' }).eq('id', draft.id).select('id');
  check(!!r5.error, `tradie cannot set status=verified on own extracted row (${r5.error?.code ?? 'no error!'})`);
  const r5b = await a.client.from('licence_verifications').update({ licence_number: 'ABC123' }).eq('id', draft.id).select('licence_number').single();
  check(!r5b.error && r5b.data.licence_number === 'ABC123', 'tradie CAN edit licence_number on own extracted row');
  // 6
  const r6 = await a.client.storage.from(BUCKET).createSignedUrl(photoPath, 60);
  check(!!r6.error || !r6.data?.signedUrl, 'tradie A cannot sign a URL for tradie B licence photo');
  const r6b = await adm.client.storage.from(BUCKET).createSignedUrl(photoPath, 60);
  check(!r6b.error && !!r6b.data?.signedUrl, 'admin CAN sign a URL for the photo');
  // 7
  const r7 = await callFn('review-licence', a.token, { verification_id: awaiting.id, decision: 'verified' });
  check(r7.status === 403, `non-admin calling review-licence gets 403 (got ${r7.status})`);
  // 8
  const r8 = await callFn('extract-licence', a.token, { storage_path: `${a.id}/none.jpg`, trade_category: 'electrician', state_code: 'QLD' });
  check(r8.status === 403, `extract-licence without consent gets 403 (got ${r8.status})`);
  // 9
  const r9 = await callFn('review-licence', adm.token, { verification_id: awaiting.id, decision: 'verified' });
  check(r9.status === 200, `admin review-licence succeeds (got ${r9.status})`);
  const { data: after } = await admin.storage.from(BUCKET).list(b.id);
  const stillThere = (after ?? []).some((f) => `${b.id}/${f.name}` === photoPath);
  check(!stillThere, 'storage object is gone after review-licence');
  const { data: row } = await admin.from('licence_verifications').select('status, storage_path, photo_deleted_at').eq('id', awaiting.id).single();
  check(row.status === 'verified' && row.storage_path === null && !!row.photo_deleted_at, 'row is verified with storage_path NULL and photo_deleted_at set');
  const { data: prof } = await admin.from('profiles').select('license_verified, verified_trades').eq('id', b.id).single();
  check(prof.license_verified === true && (prof.verified_trades ?? []).includes('plumber'), 'profile mirror: license_verified + verified_trades');
} catch (err) {
  console.error('e2e-verification: setup failed', err);
  failures++;
} finally {
  console.log('Cleaning up…');
  if (created.paths.length) await admin.storage.from(BUCKET).remove(created.paths).catch(() => {});
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

if (failures) {
  console.error(`e2e-verification: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('e2e-verification: all checks passed');
