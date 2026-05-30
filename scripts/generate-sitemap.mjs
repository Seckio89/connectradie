#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// generate-sitemap.mjs — build-time sitemap generator.
//
// Emits two files into public/:
//   • sitemap-index.xml — points at each sub-sitemap
//   • sitemap.xml       — the core, static + SEO pages
//   • sitemap-find.xml  — every /find/[trade]/[suburb] page
//   • sitemap-hubs.xml  — every /find/[trade], /find-in/[suburb], /costs/[trade]
//
// Run before deploy:
//   node scripts/generate-sitemap.mjs
//
// Or wire into vite build:
//   "build": "node scripts/generate-sitemap.mjs && vite build"
//
// The trade and suburb lists are duplicated from src/lib/seoContent/ here
// to keep the script free of TS tooling. Edit both files when adding
// trades or suburbs — a typecheck pass after will flag drift since
// landing pages validate slugs at request time.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const SITE_URL = 'https://connectradie.com.au';

// ── Trade slugs (mirror of TRADE_CATEGORIES.value, excluding 'other') ──
const TRADES = [
  'plumber', 'electrician', 'carpenter', 'builder', 'painter', 'landscaper',
  'handyman', 'cleaner', 'roofer', 'tiler', 'concreter', 'fencer', 'glazier',
  'locksmith', 'pest-control', 'air-conditioning', 'garage-doors', 'demolition',
  'bricklayer', 'plasterer', 'flooring', 'cabinet-maker', 'welder', 'insulation',
  'arborist', 'pool-builder', 'antenna-technician', 'waterproofing', 'scaffolder',
  'earthmoving', 'stonemasonry', 'solar', 'security', 'curtains-blinds',
  'lawn-mowing', 'removalist', 'bathroom-renovator', 'kitchen-renovator', 'hvac',
  'fire-safety', 'appliance-service', 'hot-water-service', 'chimney-sweep',
];

// ── Suburb slugs (mirror of SUBURBS, slug field only) ──
const SUBURBS = [
  // Sydney
  'sydney-nsw-2000', 'surry-hills-nsw-2010', 'pyrmont-nsw-2009', 'ultimo-nsw-2007',
  'darlinghurst-nsw-2010', 'paddington-nsw-2021', 'bondi-nsw-2026', 'bondi-beach-nsw-2026',
  'bondi-junction-nsw-2022', 'bronte-nsw-2024', 'coogee-nsw-2034', 'randwick-nsw-2031',
  'newtown-nsw-2042', 'glebe-nsw-2037', 'balmain-nsw-2041', 'leichhardt-nsw-2040',
  'redfern-nsw-2016', 'alexandria-nsw-2015', 'mascot-nsw-2020', 'parramatta-nsw-2150',
  'harris-park-nsw-2150', 'westmead-nsw-2145', 'granville-nsw-2142', 'merrylands-nsw-2160',
  'blacktown-nsw-2148', 'penrith-nsw-2750', 'liverpool-nsw-2170', 'campbelltown-nsw-2560',
  'hornsby-nsw-2077', 'chatswood-nsw-2067', 'north-sydney-nsw-2060', 'manly-nsw-2095',
  'dee-why-nsw-2099', 'cronulla-nsw-2230', 'hurstville-nsw-2220',
  // Melbourne
  'melbourne-vic-3000', 'southbank-vic-3006', 'docklands-vic-3008', 'carlton-vic-3053',
  'fitzroy-vic-3065', 'collingwood-vic-3066', 'richmond-vic-3121', 'south-yarra-vic-3141',
  'prahran-vic-3181', 'st-kilda-vic-3182', 'brunswick-vic-3056', 'footscray-vic-3011',
  'williamstown-vic-3016', 'preston-vic-3072', 'box-hill-vic-3128', 'glen-waverley-vic-3150',
  'frankston-vic-3199', 'dandenong-vic-3175', 'ringwood-vic-3134',
  // Brisbane
  'brisbane-qld-4000', 'fortitude-valley-qld-4006', 'new-farm-qld-4005', 'west-end-qld-4101',
  'south-brisbane-qld-4101', 'paddington-qld-4064', 'toowong-qld-4066', 'st-lucia-qld-4067',
  'indooroopilly-qld-4068', 'chermside-qld-4032', 'mount-gravatt-qld-4122', 'sunnybank-qld-4109',
  'carindale-qld-4152',
  // Perth
  'perth-wa-6000', 'fremantle-wa-6160', 'subiaco-wa-6008', 'joondalup-wa-6027',
  // Adelaide
  'adelaide-sa-5000', 'glenelg-sa-5045', 'norwood-sa-5067',
  // Canberra
  'canberra-act-2600', 'belconnen-act-2617', 'tuggeranong-act-2900',
];

// ── Static & core pages ──
const STATIC_PAGES = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/search', priority: 0.9, changefreq: 'daily' },
  { path: '/explore', priority: 0.8, changefreq: 'weekly' },
  { path: '/pricing', priority: 0.7, changefreq: 'monthly' },
  { path: '/help', priority: 0.6, changefreq: 'monthly' },
  { path: '/contact', priority: 0.4, changefreq: 'monthly' },
  { path: '/register', priority: 0.6, changefreq: 'monthly' },
  { path: '/terms', priority: 0.2, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.2, changefreq: 'yearly' },
];

// ── XML helpers ──
function xmlHeader() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n';
}

function urlEntry({ path, priority, changefreq, lastmod }) {
  const lines = [
    '  <url>',
    `    <loc>${SITE_URL}${path}</loc>`,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority !== undefined ? `    <priority>${priority.toFixed(1)}</priority>` : '',
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    '  </url>',
  ].filter(Boolean);
  return lines.join('\n');
}

function urlset(entries) {
  return (
    xmlHeader() +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(urlEntry).join('\n') +
    '\n</urlset>\n'
  );
}

function sitemapIndex(sitemaps, lastmod) {
  return (
    xmlHeader() +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps
      .map(
        (s) =>
          `  <sitemap>\n    <loc>${SITE_URL}${s}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
      )
      .join('\n') +
    '\n</sitemapindex>\n'
  );
}

// ── Build entries ──
function buildFindEntries() {
  const entries = [];
  for (const trade of TRADES) {
    for (const suburb of SUBURBS) {
      entries.push({
        path: `/find/${trade}/${suburb}`,
        priority: 0.7,
        changefreq: 'weekly',
      });
    }
  }
  return entries;
}

function buildHubEntries() {
  const entries = [];
  // Trade hubs
  for (const trade of TRADES) {
    entries.push({
      path: `/find/${trade}`,
      priority: 0.8,
      changefreq: 'weekly',
    });
    entries.push({
      path: `/costs/${trade}`,
      priority: 0.7,
      changefreq: 'monthly',
    });
  }
  // Suburb hubs
  for (const suburb of SUBURBS) {
    entries.push({
      path: `/find-in/${suburb}`,
      priority: 0.7,
      changefreq: 'weekly',
    });
  }
  return entries;
}

// ── Write files ──
async function main() {
  if (!existsSync(PUBLIC_DIR)) {
    await mkdir(PUBLIC_DIR, { recursive: true });
  }

  const now = new Date().toISOString().split('T')[0];

  // Core sitemap (static pages)
  const coreEntries = STATIC_PAGES.map((p) => ({ ...p, lastmod: now }));
  await writeFile(join(PUBLIC_DIR, 'sitemap.xml'), urlset(coreEntries), 'utf-8');

  // Find sitemap (every trade × suburb)
  const findEntries = buildFindEntries().map((e) => ({ ...e, lastmod: now }));
  await writeFile(join(PUBLIC_DIR, 'sitemap-find.xml'), urlset(findEntries), 'utf-8');

  // Hubs sitemap (trade hubs + suburb hubs + cost guides)
  const hubEntries = buildHubEntries().map((e) => ({ ...e, lastmod: now }));
  await writeFile(join(PUBLIC_DIR, 'sitemap-hubs.xml'), urlset(hubEntries), 'utf-8');

  // Sitemap index
  await writeFile(
    join(PUBLIC_DIR, 'sitemap-index.xml'),
    sitemapIndex(['/sitemap.xml', '/sitemap-find.xml', '/sitemap-hubs.xml'], now),
    'utf-8',
  );

  // Logging
  const totalFind = findEntries.length;
  const totalHubs = hubEntries.length;
  const total = STATIC_PAGES.length + totalFind + totalHubs;
  console.log(`✓ Sitemap generated (${total} URLs total)`);
  console.log(`  • sitemap.xml         — ${STATIC_PAGES.length} core pages`);
  console.log(`  • sitemap-find.xml    — ${totalFind} /find/[trade]/[suburb] pages`);
  console.log(`  • sitemap-hubs.xml    — ${totalHubs} hub pages (${TRADES.length} trade hubs + ${TRADES.length} cost guides + ${SUBURBS.length} suburb hubs)`);
  console.log(`  • sitemap-index.xml   — index pointing at the three`);
  console.log('');
  console.log(`Submit to Google Search Console: ${SITE_URL}/sitemap-index.xml`);
}

main().catch((err) => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
