#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// backfill-geocodes.mjs — one-off geocoder for rows created before coordinates
// were captured.
//
// New jobs get exact lat/lng from Google Places at post time, and tradies get
// base_latitude/base_longitude when they pick an address. This script fills in
// anything older (or any row where the address was typed by hand and never
// resolved to a place) by geocoding the stored text address.
//
// Geocoder: OpenStreetMap Nominatim (free, no key) — the same service the app
// already uses for reverse geocoding. Nominatim's usage policy caps you at
// ~1 request/second, so this runs sequentially with a delay. For large
// datasets, swap GEOCODE_URL for the Google Geocoding API.
//
// Usage (from project root):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-geocodes.mjs
//   add --dry-run to preview without writing.
//
// The service-role key is required (bypasses RLS to read/update every row).
// NEVER commit it — pass it via the environment.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

const GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100; // stay under Nominatim's 1 req/sec policy

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Geocode a free-text address → {lat, lng} or null. Biased to Australia. */
async function geocode(address) {
  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'au',
    q: address,
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`, {
    headers: {
      'Accept-Language': 'en',
      // Nominatim requires an identifying User-Agent.
      'User-Agent': 'ConnecTradie-backfill/1.0 (support@connectradie.com)',
    },
  });
  if (!res.ok) {
    console.warn(`  geocode HTTP ${res.status} for "${address}"`);
    return null;
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function backfillJobs() {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, location_address')
    .is('latitude', null)
    .not('location_address', 'is', null)
    .neq('location_address', '');

  if (error) throw error;
  console.log(`\nJobs needing coordinates: ${jobs.length}`);

  let done = 0;
  for (const job of jobs) {
    const coords = await geocode(job.location_address);
    if (!coords) {
      console.warn(`  ✗ could not geocode job ${job.id}: "${job.location_address}"`);
    } else {
      console.log(`  ✓ ${job.location_address} → ${coords.lat}, ${coords.lng}`);
      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from('jobs')
          .update({ latitude: coords.lat, longitude: coords.lng })
          .eq('id', job.id);
        if (upErr) console.error(`    update failed: ${upErr.message}`);
        else done++;
      }
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`Jobs updated: ${done}`);
}

async function backfillTradies() {
  const { data: tradies, error } = await supabase
    .from('profiles')
    .select('id, address')
    .eq('role', 'tradie')
    .is('base_latitude', null)
    .not('address', 'is', null)
    .neq('address', '');

  if (error) throw error;
  console.log(`\nTradies needing base coordinates: ${tradies.length}`);

  let done = 0;
  for (const tradie of tradies) {
    const coords = await geocode(tradie.address);
    if (!coords) {
      console.warn(`  ✗ could not geocode tradie ${tradie.id}: "${tradie.address}"`);
    } else {
      console.log(`  ✓ ${tradie.address} → ${coords.lat}, ${coords.lng}`);
      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ base_latitude: coords.lat, base_longitude: coords.lng })
          .eq('id', tradie.id);
        if (upErr) console.error(`    update failed: ${upErr.message}`);
        else done++;
      }
    }
    await sleep(RATE_LIMIT_MS);
  }
  console.log(`Tradies updated: ${done}`);
}

(async () => {
  console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — writing coordinates');
  await backfillJobs();
  await backfillTradies();
  console.log('\nDone.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
