// ─────────────────────────────────────────────────────────────────────────────
// AU suburb data for SEO landing pages.
//
// Phase 1 (this file): 80 high-population metro suburbs across Sydney,
// Melbourne, Brisbane. Enough to seed initial /find/[trade]/[suburb] pages.
//
// Phase 2 (future): expand to ~500 suburbs via ABS postcode dataset.
// Phase 3: full national rollout.
//
// `neighbours` powers internal linking on every landing page — the most
// important SEO factor after content depth. Each suburb links to 4–6
// geographically adjacent suburbs, creating a topic cluster Google
// recognises as authoritative for the region.
// ─────────────────────────────────────────────────────────────────────────────

export interface Suburb {
  /** URL slug, e.g. "parramatta-nsw-2150" */
  slug: string;
  /** Human-readable name, e.g. "Parramatta" */
  name: string;
  /** State abbreviation, e.g. "NSW" */
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';
  /** Postcode, e.g. "2150" */
  postcode: string;
  /** Capital city this suburb sits within, used for parent hub linking */
  city: 'Sydney' | 'Melbourne' | 'Brisbane' | 'Perth' | 'Adelaide' | 'Hobart' | 'Canberra' | 'Darwin';
  /** Slugs of geographically adjacent suburbs (for internal linking) */
  neighbours: string[];
}

export const SUBURBS: Suburb[] = [
  // ── Sydney metro ──
  { slug: 'sydney-nsw-2000', name: 'Sydney CBD', state: 'NSW', postcode: '2000', city: 'Sydney', neighbours: ['surry-hills-nsw-2010', 'pyrmont-nsw-2009', 'darlinghurst-nsw-2010', 'ultimo-nsw-2007'] },
  { slug: 'surry-hills-nsw-2010', name: 'Surry Hills', state: 'NSW', postcode: '2010', city: 'Sydney', neighbours: ['sydney-nsw-2000', 'darlinghurst-nsw-2010', 'redfern-nsw-2016', 'paddington-nsw-2021'] },
  { slug: 'pyrmont-nsw-2009', name: 'Pyrmont', state: 'NSW', postcode: '2009', city: 'Sydney', neighbours: ['sydney-nsw-2000', 'ultimo-nsw-2007', 'glebe-nsw-2037', 'balmain-nsw-2041'] },
  { slug: 'ultimo-nsw-2007', name: 'Ultimo', state: 'NSW', postcode: '2007', city: 'Sydney', neighbours: ['sydney-nsw-2000', 'pyrmont-nsw-2009', 'glebe-nsw-2037', 'chippendale-nsw-2008'] },
  { slug: 'darlinghurst-nsw-2010', name: 'Darlinghurst', state: 'NSW', postcode: '2010', city: 'Sydney', neighbours: ['sydney-nsw-2000', 'surry-hills-nsw-2010', 'potts-point-nsw-2011', 'paddington-nsw-2021'] },
  { slug: 'paddington-nsw-2021', name: 'Paddington', state: 'NSW', postcode: '2021', city: 'Sydney', neighbours: ['darlinghurst-nsw-2010', 'surry-hills-nsw-2010', 'woollahra-nsw-2025', 'bondi-junction-nsw-2022'] },
  { slug: 'bondi-nsw-2026', name: 'Bondi', state: 'NSW', postcode: '2026', city: 'Sydney', neighbours: ['bondi-junction-nsw-2022', 'bondi-beach-nsw-2026', 'tamarama-nsw-2026', 'bronte-nsw-2024'] },
  { slug: 'bondi-beach-nsw-2026', name: 'Bondi Beach', state: 'NSW', postcode: '2026', city: 'Sydney', neighbours: ['bondi-nsw-2026', 'bondi-junction-nsw-2022', 'tamarama-nsw-2026', 'bronte-nsw-2024'] },
  { slug: 'bondi-junction-nsw-2022', name: 'Bondi Junction', state: 'NSW', postcode: '2022', city: 'Sydney', neighbours: ['bondi-nsw-2026', 'paddington-nsw-2021', 'waverley-nsw-2024', 'queens-park-nsw-2022'] },
  { slug: 'bronte-nsw-2024', name: 'Bronte', state: 'NSW', postcode: '2024', city: 'Sydney', neighbours: ['bondi-nsw-2026', 'waverley-nsw-2024', 'tamarama-nsw-2026', 'clovelly-nsw-2031'] },
  { slug: 'coogee-nsw-2034', name: 'Coogee', state: 'NSW', postcode: '2034', city: 'Sydney', neighbours: ['randwick-nsw-2031', 'clovelly-nsw-2031', 'maroubra-nsw-2035', 'south-coogee-nsw-2034'] },
  { slug: 'randwick-nsw-2031', name: 'Randwick', state: 'NSW', postcode: '2031', city: 'Sydney', neighbours: ['coogee-nsw-2034', 'clovelly-nsw-2031', 'kensington-nsw-2033', 'kingsford-nsw-2032'] },
  { slug: 'newtown-nsw-2042', name: 'Newtown', state: 'NSW', postcode: '2042', city: 'Sydney', neighbours: ['enmore-nsw-2042', 'erskineville-nsw-2043', 'st-peters-nsw-2044', 'camperdown-nsw-2050'] },
  { slug: 'glebe-nsw-2037', name: 'Glebe', state: 'NSW', postcode: '2037', city: 'Sydney', neighbours: ['ultimo-nsw-2007', 'pyrmont-nsw-2009', 'camperdown-nsw-2050', 'forest-lodge-nsw-2037'] },
  { slug: 'balmain-nsw-2041', name: 'Balmain', state: 'NSW', postcode: '2041', city: 'Sydney', neighbours: ['rozelle-nsw-2039', 'birchgrove-nsw-2041', 'pyrmont-nsw-2009', 'leichhardt-nsw-2040'] },
  { slug: 'leichhardt-nsw-2040', name: 'Leichhardt', state: 'NSW', postcode: '2040', city: 'Sydney', neighbours: ['balmain-nsw-2041', 'lilyfield-nsw-2040', 'annandale-nsw-2038', 'haberfield-nsw-2045'] },
  { slug: 'redfern-nsw-2016', name: 'Redfern', state: 'NSW', postcode: '2016', city: 'Sydney', neighbours: ['surry-hills-nsw-2010', 'waterloo-nsw-2017', 'alexandria-nsw-2015', 'eveleigh-nsw-2015'] },
  { slug: 'alexandria-nsw-2015', name: 'Alexandria', state: 'NSW', postcode: '2015', city: 'Sydney', neighbours: ['redfern-nsw-2016', 'waterloo-nsw-2017', 'erskineville-nsw-2043', 'mascot-nsw-2020'] },
  { slug: 'mascot-nsw-2020', name: 'Mascot', state: 'NSW', postcode: '2020', city: 'Sydney', neighbours: ['alexandria-nsw-2015', 'rosebery-nsw-2018', 'botany-nsw-2019', 'eastlakes-nsw-2018'] },
  { slug: 'parramatta-nsw-2150', name: 'Parramatta', state: 'NSW', postcode: '2150', city: 'Sydney', neighbours: ['harris-park-nsw-2150', 'westmead-nsw-2145', 'granville-nsw-2142', 'north-parramatta-nsw-2151'] },
  { slug: 'harris-park-nsw-2150', name: 'Harris Park', state: 'NSW', postcode: '2150', city: 'Sydney', neighbours: ['parramatta-nsw-2150', 'rosehill-nsw-2142', 'granville-nsw-2142', 'merrylands-nsw-2160'] },
  { slug: 'westmead-nsw-2145', name: 'Westmead', state: 'NSW', postcode: '2145', city: 'Sydney', neighbours: ['parramatta-nsw-2150', 'north-parramatta-nsw-2151', 'wentworthville-nsw-2145', 'mays-hill-nsw-2145'] },
  { slug: 'granville-nsw-2142', name: 'Granville', state: 'NSW', postcode: '2142', city: 'Sydney', neighbours: ['parramatta-nsw-2150', 'harris-park-nsw-2150', 'merrylands-nsw-2160', 'auburn-nsw-2144'] },
  { slug: 'merrylands-nsw-2160', name: 'Merrylands', state: 'NSW', postcode: '2160', city: 'Sydney', neighbours: ['granville-nsw-2142', 'guildford-nsw-2161', 'fairfield-nsw-2165', 'greystanes-nsw-2145'] },
  { slug: 'blacktown-nsw-2148', name: 'Blacktown', state: 'NSW', postcode: '2148', city: 'Sydney', neighbours: ['seven-hills-nsw-2147', 'doonside-nsw-2767', 'rooty-hill-nsw-2766', 'mount-druitt-nsw-2770'] },
  { slug: 'penrith-nsw-2750', name: 'Penrith', state: 'NSW', postcode: '2750', city: 'Sydney', neighbours: ['kingswood-nsw-2747', 'cambridge-park-nsw-2747', 'south-penrith-nsw-2750', 'jamisontown-nsw-2750'] },
  { slug: 'liverpool-nsw-2170', name: 'Liverpool', state: 'NSW', postcode: '2170', city: 'Sydney', neighbours: ['warwick-farm-nsw-2170', 'casula-nsw-2170', 'lurnea-nsw-2170', 'moorebank-nsw-2170'] },
  { slug: 'campbelltown-nsw-2560', name: 'Campbelltown', state: 'NSW', postcode: '2560', city: 'Sydney', neighbours: ['leumeah-nsw-2560', 'minto-nsw-2566', 'ingleburn-nsw-2565', 'macarthur-nsw-2560'] },
  { slug: 'hornsby-nsw-2077', name: 'Hornsby', state: 'NSW', postcode: '2077', city: 'Sydney', neighbours: ['waitara-nsw-2077', 'asquith-nsw-2077', 'normanhurst-nsw-2076', 'thornleigh-nsw-2120'] },
  { slug: 'chatswood-nsw-2067', name: 'Chatswood', state: 'NSW', postcode: '2067', city: 'Sydney', neighbours: ['willoughby-nsw-2068', 'roseville-nsw-2069', 'artarmon-nsw-2064', 'lane-cove-nsw-2066'] },
  { slug: 'north-sydney-nsw-2060', name: 'North Sydney', state: 'NSW', postcode: '2060', city: 'Sydney', neighbours: ['mcmahons-point-nsw-2060', 'kirribilli-nsw-2061', 'milsons-point-nsw-2061', 'crows-nest-nsw-2065'] },
  { slug: 'manly-nsw-2095', name: 'Manly', state: 'NSW', postcode: '2095', city: 'Sydney', neighbours: ['fairlight-nsw-2094', 'balgowlah-nsw-2093', 'queenscliff-nsw-2096', 'north-manly-nsw-2100'] },
  { slug: 'dee-why-nsw-2099', name: 'Dee Why', state: 'NSW', postcode: '2099', city: 'Sydney', neighbours: ['cromer-nsw-2099', 'collaroy-nsw-2097', 'narrabeen-nsw-2101', 'brookvale-nsw-2100'] },
  { slug: 'cronulla-nsw-2230', name: 'Cronulla', state: 'NSW', postcode: '2230', city: 'Sydney', neighbours: ['woolooware-nsw-2230', 'caringbah-nsw-2229', 'burraneer-nsw-2230', 'bundeena-nsw-2230'] },
  { slug: 'hurstville-nsw-2220', name: 'Hurstville', state: 'NSW', postcode: '2220', city: 'Sydney', neighbours: ['kogarah-nsw-2217', 'mortdale-nsw-2223', 'penshurst-nsw-2222', 'allawah-nsw-2218'] },

  // ── Melbourne metro ──
  { slug: 'melbourne-vic-3000', name: 'Melbourne CBD', state: 'VIC', postcode: '3000', city: 'Melbourne', neighbours: ['southbank-vic-3006', 'docklands-vic-3008', 'east-melbourne-vic-3002', 'carlton-vic-3053'] },
  { slug: 'southbank-vic-3006', name: 'Southbank', state: 'VIC', postcode: '3006', city: 'Melbourne', neighbours: ['melbourne-vic-3000', 'south-melbourne-vic-3205', 'docklands-vic-3008', 'south-yarra-vic-3141'] },
  { slug: 'docklands-vic-3008', name: 'Docklands', state: 'VIC', postcode: '3008', city: 'Melbourne', neighbours: ['melbourne-vic-3000', 'southbank-vic-3006', 'west-melbourne-vic-3003', 'north-melbourne-vic-3051'] },
  { slug: 'carlton-vic-3053', name: 'Carlton', state: 'VIC', postcode: '3053', city: 'Melbourne', neighbours: ['melbourne-vic-3000', 'fitzroy-vic-3065', 'parkville-vic-3052', 'north-melbourne-vic-3051'] },
  { slug: 'fitzroy-vic-3065', name: 'Fitzroy', state: 'VIC', postcode: '3065', city: 'Melbourne', neighbours: ['carlton-vic-3053', 'collingwood-vic-3066', 'north-fitzroy-vic-3068', 'clifton-hill-vic-3068'] },
  { slug: 'collingwood-vic-3066', name: 'Collingwood', state: 'VIC', postcode: '3066', city: 'Melbourne', neighbours: ['fitzroy-vic-3065', 'abbotsford-vic-3067', 'richmond-vic-3121', 'clifton-hill-vic-3068'] },
  { slug: 'richmond-vic-3121', name: 'Richmond', state: 'VIC', postcode: '3121', city: 'Melbourne', neighbours: ['collingwood-vic-3066', 'cremorne-vic-3121', 'south-yarra-vic-3141', 'east-melbourne-vic-3002'] },
  { slug: 'south-yarra-vic-3141', name: 'South Yarra', state: 'VIC', postcode: '3141', city: 'Melbourne', neighbours: ['prahran-vic-3181', 'toorak-vic-3142', 'richmond-vic-3121', 'windsor-vic-3181'] },
  { slug: 'prahran-vic-3181', name: 'Prahran', state: 'VIC', postcode: '3181', city: 'Melbourne', neighbours: ['south-yarra-vic-3141', 'windsor-vic-3181', 'armadale-vic-3143', 'st-kilda-vic-3182'] },
  { slug: 'st-kilda-vic-3182', name: 'St Kilda', state: 'VIC', postcode: '3182', city: 'Melbourne', neighbours: ['prahran-vic-3181', 'windsor-vic-3181', 'elwood-vic-3184', 'balaclava-vic-3183'] },
  { slug: 'brunswick-vic-3056', name: 'Brunswick', state: 'VIC', postcode: '3056', city: 'Melbourne', neighbours: ['brunswick-east-vic-3057', 'brunswick-west-vic-3055', 'coburg-vic-3058', 'parkville-vic-3052'] },
  { slug: 'footscray-vic-3011', name: 'Footscray', state: 'VIC', postcode: '3011', city: 'Melbourne', neighbours: ['seddon-vic-3011', 'yarraville-vic-3013', 'west-footscray-vic-3012', 'kensington-vic-3031'] },
  { slug: 'williamstown-vic-3016', name: 'Williamstown', state: 'VIC', postcode: '3016', city: 'Melbourne', neighbours: ['newport-vic-3015', 'spotswood-vic-3015', 'altona-vic-3018', 'south-kingsville-vic-3015'] },
  { slug: 'preston-vic-3072', name: 'Preston', state: 'VIC', postcode: '3072', city: 'Melbourne', neighbours: ['reservoir-vic-3073', 'thornbury-vic-3071', 'northcote-vic-3070', 'coburg-vic-3058'] },
  { slug: 'box-hill-vic-3128', name: 'Box Hill', state: 'VIC', postcode: '3128', city: 'Melbourne', neighbours: ['box-hill-north-vic-3129', 'box-hill-south-vic-3128', 'blackburn-vic-3130', 'mont-albert-vic-3127'] },
  { slug: 'glen-waverley-vic-3150', name: 'Glen Waverley', state: 'VIC', postcode: '3150', city: 'Melbourne', neighbours: ['mount-waverley-vic-3149', 'wheelers-hill-vic-3150', 'notting-hill-vic-3168', 'syndal-vic-3149'] },
  { slug: 'frankston-vic-3199', name: 'Frankston', state: 'VIC', postcode: '3199', city: 'Melbourne', neighbours: ['frankston-south-vic-3199', 'seaford-vic-3198', 'langwarrin-vic-3910', 'karingal-vic-3199'] },
  { slug: 'dandenong-vic-3175', name: 'Dandenong', state: 'VIC', postcode: '3175', city: 'Melbourne', neighbours: ['dandenong-north-vic-3175', 'noble-park-vic-3174', 'springvale-vic-3171', 'doveton-vic-3177'] },
  { slug: 'ringwood-vic-3134', name: 'Ringwood', state: 'VIC', postcode: '3134', city: 'Melbourne', neighbours: ['ringwood-east-vic-3135', 'mitcham-vic-3132', 'heathmont-vic-3135', 'croydon-vic-3136'] },

  // ── Brisbane metro ──
  { slug: 'brisbane-qld-4000', name: 'Brisbane CBD', state: 'QLD', postcode: '4000', city: 'Brisbane', neighbours: ['spring-hill-qld-4000', 'south-brisbane-qld-4101', 'fortitude-valley-qld-4006', 'kangaroo-point-qld-4169'] },
  { slug: 'fortitude-valley-qld-4006', name: 'Fortitude Valley', state: 'QLD', postcode: '4006', city: 'Brisbane', neighbours: ['brisbane-qld-4000', 'spring-hill-qld-4000', 'new-farm-qld-4005', 'bowen-hills-qld-4006'] },
  { slug: 'new-farm-qld-4005', name: 'New Farm', state: 'QLD', postcode: '4005', city: 'Brisbane', neighbours: ['fortitude-valley-qld-4006', 'teneriffe-qld-4005', 'newstead-qld-4006', 'kangaroo-point-qld-4169'] },
  { slug: 'west-end-qld-4101', name: 'West End', state: 'QLD', postcode: '4101', city: 'Brisbane', neighbours: ['south-brisbane-qld-4101', 'highgate-hill-qld-4101', 'dutton-park-qld-4102', 'st-lucia-qld-4067'] },
  { slug: 'south-brisbane-qld-4101', name: 'South Brisbane', state: 'QLD', postcode: '4101', city: 'Brisbane', neighbours: ['west-end-qld-4101', 'brisbane-qld-4000', 'highgate-hill-qld-4101', 'kangaroo-point-qld-4169'] },
  { slug: 'paddington-qld-4064', name: 'Paddington (Brisbane)', state: 'QLD', postcode: '4064', city: 'Brisbane', neighbours: ['milton-qld-4064', 'red-hill-qld-4059', 'rosalie-qld-4064', 'bardon-qld-4065'] },
  { slug: 'toowong-qld-4066', name: 'Toowong', state: 'QLD', postcode: '4066', city: 'Brisbane', neighbours: ['st-lucia-qld-4067', 'auchenflower-qld-4066', 'milton-qld-4064', 'taringa-qld-4068'] },
  { slug: 'st-lucia-qld-4067', name: 'St Lucia', state: 'QLD', postcode: '4067', city: 'Brisbane', neighbours: ['toowong-qld-4066', 'indooroopilly-qld-4068', 'taringa-qld-4068', 'west-end-qld-4101'] },
  { slug: 'indooroopilly-qld-4068', name: 'Indooroopilly', state: 'QLD', postcode: '4068', city: 'Brisbane', neighbours: ['st-lucia-qld-4067', 'taringa-qld-4068', 'kenmore-qld-4069', 'chelmer-qld-4068'] },
  { slug: 'chermside-qld-4032', name: 'Chermside', state: 'QLD', postcode: '4032', city: 'Brisbane', neighbours: ['kedron-qld-4031', 'wavell-heights-qld-4012', 'aspley-qld-4034', 'chermside-west-qld-4032'] },
  { slug: 'mount-gravatt-qld-4122', name: 'Mount Gravatt', state: 'QLD', postcode: '4122', city: 'Brisbane', neighbours: ['mount-gravatt-east-qld-4122', 'upper-mount-gravatt-qld-4122', 'macgregor-qld-4109', 'holland-park-qld-4121'] },
  { slug: 'sunnybank-qld-4109', name: 'Sunnybank', state: 'QLD', postcode: '4109', city: 'Brisbane', neighbours: ['sunnybank-hills-qld-4109', 'macgregor-qld-4109', 'runcorn-qld-4113', 'coopers-plains-qld-4108'] },
  { slug: 'carindale-qld-4152', name: 'Carindale', state: 'QLD', postcode: '4152', city: 'Brisbane', neighbours: ['camp-hill-qld-4152', 'belmont-qld-4153', 'tingalpa-qld-4173', 'mansfield-qld-4122'] },

  // ── Perth metro ──
  { slug: 'perth-wa-6000', name: 'Perth CBD', state: 'WA', postcode: '6000', city: 'Perth', neighbours: ['east-perth-wa-6004', 'west-perth-wa-6005', 'northbridge-wa-6003', 'highgate-wa-6003'] },
  { slug: 'fremantle-wa-6160', name: 'Fremantle', state: 'WA', postcode: '6160', city: 'Perth', neighbours: ['east-fremantle-wa-6158', 'south-fremantle-wa-6162', 'north-fremantle-wa-6159', 'beaconsfield-wa-6162'] },
  { slug: 'subiaco-wa-6008', name: 'Subiaco', state: 'WA', postcode: '6008', city: 'Perth', neighbours: ['west-perth-wa-6005', 'shenton-park-wa-6008', 'jolimont-wa-6014', 'daglish-wa-6008'] },
  { slug: 'joondalup-wa-6027', name: 'Joondalup', state: 'WA', postcode: '6027', city: 'Perth', neighbours: ['edgewater-wa-6027', 'connolly-wa-6027', 'currambine-wa-6028', 'heathridge-wa-6027'] },

  // ── Adelaide metro ──
  { slug: 'adelaide-sa-5000', name: 'Adelaide CBD', state: 'SA', postcode: '5000', city: 'Adelaide', neighbours: ['north-adelaide-sa-5006', 'eastwood-sa-5063', 'parkside-sa-5063', 'kent-town-sa-5067'] },
  { slug: 'glenelg-sa-5045', name: 'Glenelg', state: 'SA', postcode: '5045', city: 'Adelaide', neighbours: ['glenelg-north-sa-5045', 'glenelg-south-sa-5045', 'somerton-park-sa-5044', 'morphettville-sa-5043'] },
  { slug: 'norwood-sa-5067', name: 'Norwood', state: 'SA', postcode: '5067', city: 'Adelaide', neighbours: ['kent-town-sa-5067', 'st-peters-sa-5069', 'maylands-sa-5069', 'eastwood-sa-5063'] },

  // ── Canberra ──
  { slug: 'canberra-act-2600', name: 'Canberra City', state: 'ACT', postcode: '2600', city: 'Canberra', neighbours: ['braddon-act-2612', 'turner-act-2612', 'reid-act-2612', 'acton-act-2601'] },
  { slug: 'belconnen-act-2617', name: 'Belconnen', state: 'ACT', postcode: '2617', city: 'Canberra', neighbours: ['bruce-act-2617', 'florey-act-2615', 'kaleen-act-2617', 'macquarie-act-2614'] },
  { slug: 'tuggeranong-act-2900', name: 'Tuggeranong', state: 'ACT', postcode: '2900', city: 'Canberra', neighbours: ['greenway-act-2900', 'kambah-act-2902', 'wanniassa-act-2903', 'erindale-act-2903'] },
];

const SUBURB_BY_SLUG = new Map(SUBURBS.map((s) => [s.slug, s]));

/** Look up a suburb by URL slug. Returns undefined if not in the dataset. */
export function getSuburb(slug: string): Suburb | undefined {
  return SUBURB_BY_SLUG.get(slug);
}

/** All suburbs for a given city, alphabetised. */
export function getSuburbsInCity(city: Suburb['city']): Suburb[] {
  return SUBURBS.filter((s) => s.city === city).sort((a, b) => a.name.localeCompare(b.name));
}

/** All suburbs for a given state, alphabetised. */
export function getSuburbsInState(state: Suburb['state']): Suburb[] {
  return SUBURBS.filter((s) => s.state === state).sort((a, b) => a.name.localeCompare(b.name));
}

/** All distinct cities currently represented in the dataset. */
export function getAllCities(): Suburb['city'][] {
  return Array.from(new Set(SUBURBS.map((s) => s.city)));
}
