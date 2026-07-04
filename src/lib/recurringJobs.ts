import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Pre-written quote message options per trade (Australian tradie tone)
// ---------------------------------------------------------------------------

export const QUOTE_MESSAGE_OPTIONS: Record<string, string[]> = {
  'Cleaning': [
    "Hi, happy to help with the clean. I bring all my own equipment and products — just need access on the day. Available this week, let me know what suits.",
    "G'day, I've done plenty of similar cleans in the area and know what's needed. Price covers a full clean, nothing extra. Can start as soon as you need.",
    "Hi there, I run a small cleaning business and take pride in doing a thorough job every time. Happy to do a walkthrough first if you'd like. Just let me know.",
    "Hey, seen the job and happy to quote. I'll bring everything needed and leave the place spotless. Flexible on timing — what works for you?",
    "Hi, I do regular and one-off cleans across the area. My price is all-inclusive, no hidden costs. Can get started this week if that works.",
  ],

  'Office Clean': [
    "Hi, I specialise in commercial and office cleaning. I work around your business hours — early morning or after hours, whatever suits. All products and equipment supplied.",
    "G'day, done plenty of office cleans and understand the need for consistency and reliability. Price covers everything — no extras. Happy to discuss a regular arrangement.",
    "Hi there, I take commercial cleaning seriously — properly sanitised surfaces, floors, bathrooms, and kitchen every visit. Let me know your schedule and I'll work around it.",
    "Hey, I can handle the full office clean. Bring all my own gear, work quietly and efficiently, and won't disrupt your team. Available to start this week.",
    "Hi, regular office cleaning is my bread and butter. I know what businesses need and I'm reliable — same standard every time. Happy to chat about what works for you.",
  ],

  'Lawn Mowing': [
    "G'day, happy to take care of the lawn. I mow, edge, and blow down the paths — leave it looking sharp. Can get there this week if the weather holds.",
    "Hi, I do regular lawn maintenance across the area. My price covers mow, edge, and cleanup — no extra charges. Let me know what day suits.",
    "Hey, seen the job and can definitely help. Bring my own equipment, do a clean edge and blow down after. Happy to set up a regular run if you need.",
    "Hi there, I've been mowing lawns in the area for years. Quick, tidy, and reliable. Price is all-in — just tell me when you want it done.",
    "G'day, I do lawn runs through the area regularly. Can fit you in this week. Mow, edge, and all clippings cleared — job done.",
  ],

  'Pool Service': [
    "Hi, happy to take a look at the pool. I'll test the water, balance the chemicals, and give you a full rundown of what it needs. No hidden costs.",
    "G'day, I do regular pool maintenance and know my way around most systems. Price covers chemicals, filter check, and vacuum. Can start this week.",
    "Hey, seen the job. I'll get the water balanced and the pool looking good — bring all chemicals and equipment. Happy to set up a regular service if needed.",
    "Hi there, pool care is what I do. I'll assess the current condition, sort out the chemistry, and leave you with a clear, safe pool. Available this week.",
    "G'day, I service pools across the area weekly. Reliable, thorough, and I always let you know if anything needs attention. Happy to discuss a regular arrangement.",
  ],

  'Electrical': [
    "Hi, licensed electrician here. Happy to take on the job — all work is fully compliant and I carry full insurance. Can provide a detailed quote after a quick look.",
    "G'day, I've done plenty of similar electrical work and can give you a firm price once I see it in person. All work certified. Available this week.",
    "Hey, seen the job. I'm a licensed sparky with experience in residential and commercial work. Happy to come out for a look — no obligation. Just let me know.",
    "Hi there, all electrical work I do is compliant, certified, and backed by a warranty. I give straight pricing — no surprises. Can come out this week.",
    "G'day, I work in the area and can get to you quickly. Full licence and insurance, honest pricing. Let me know a time that suits for a look.",
  ],

  'Plumbing': [
    "Hi, licensed plumber here. Happy to help with the job — can come out for a look and give you a firm price. No call-out surprises.",
    "G'day, I've handled plenty of similar plumbing work and can give you a straight quote. Fully licensed, all work guaranteed. Available this week.",
    "Hey, seen the job. I'll come out, assess what's needed, and give you an honest price. I don't charge for things that aren't necessary. Let me know when suits.",
    "Hi there, I work across the area and can get to you quickly. Upfront pricing, fully licensed, tidy worksite. Happy to come out for a look.",
    "G'day, I'm a plumber with years of experience on residential jobs. Straight pricing, quality work, and I leave the place clean. Available this week.",
  ],

  'Painting': [
    "Hi, I've done plenty of interior and exterior painting in the area. I prep properly — no shortcuts. Happy to come out for a look and give you a firm price.",
    "G'day, I take prep seriously which is why my finishes last. Price covers full prep, undercoat if needed, and two coats minimum. Can start within the week.",
    "Hey, seen the job. I use quality paints and take my time to do it right. Happy to discuss colours, finishes, and timing. Give me a call.",
    "Hi there, painting is all I do and I do it properly. Straight price, clean worksite, and I won't leave until you're happy with the finish.",
    "G'day, I work across the area and have a good reputation for quality work. Happy to come out for a look — no obligation quote. Let me know what suits.",
  ],

  'Carpentry': [
    "Hi, happy to help with the carpentry work. I've done plenty of similar jobs and can give you a firm price after a quick look. Quality finish guaranteed.",
    "G'day, I'm a chippy with years of experience on residential jobs. I give straight quotes, do quality work, and clean up after myself. Available this week.",
    "Hey, seen the job. I'll come out, measure up, and give you an honest price. I don't cut corners — the job gets done properly. Let me know when suits.",
    "Hi there, carpentry is my trade and I take pride in a clean finish. Upfront pricing and I'll keep you in the loop throughout. Happy to come for a look.",
    "G'day, I work in the area and can get to you this week. Quality materials, proper workmanship, and a tidy finish every time.",
  ],

  'Pest Control': [
    "Hi, licensed pest tech here. I use family and pet-safe products and give you a full report after treatment. Happy to come out for an inspection first.",
    "G'day, I've treated plenty of similar properties in the area. I'll identify what's going on and give you a clear plan before we start. No guesswork.",
    "Hey, seen the job. I carry full insurance and use registered products only. Treatment is thorough — not just a spray and go. Let me know when suits.",
    "Hi there, pest control is what I do. I give you a proper inspection, explain what I find, and treat it the right way. Happy to come out this week.",
    "G'day, I work across the area and know the common pest issues in your suburb. Fast response, quality treatment, and a follow-up if needed.",
  ],

  'Handyman': [
    "Hi, happy to help with the job. I can handle most household repairs and maintenance — bring my own tools and materials if needed. Available this week.",
    "G'day, I've been doing handyman work for years. I give straight prices and get things done properly the first time. Happy to come out for a look.",
    "Hey, seen the job. I can sort it out — no drama. Let me know when suits and I'll be there. I work cleanly and tidy up after myself.",
    "Hi there, I do all kinds of maintenance and repair work. Honest pricing, reliable, and I won't leave until the job is done right.",
    "G'day, I'm in the area regularly and can get to you quickly. Experienced across a wide range of jobs — just let me know what you need.",
  ],

  'default': [
    "Hi, happy to help with this job. I've done similar work in the area and can give you a firm price. Available this week — just let me know what suits.",
    "G'day, I've looked at the job description and I'm confident I can get it done properly. Happy to come out for a look before committing to a price.",
    "Hey, seen the job and I'm interested. I work cleanly, communicate well, and don't leave until you're happy. Let me know when you want to chat.",
    "Hi there, I work in your area and can get to you this week. Straight pricing, quality work, and I always tidy up after myself.",
    "G'day, happy to quote on this. I take pride in doing the job right — not just getting it done. Let me know if you have any questions before deciding.",
  ],
};

/**
 * Resolve which QUOTE_MESSAGE_OPTIONS key to use for a given job.
 * Checks service_subtype first, then trade_type / category, then falls back to 'default'.
 */
export function resolveMessageOptionsKey(
  serviceSubtype?: string | null,
  tradeType?: string | null,
  category?: string | null,
): string {
  const sub = (serviceSubtype || '').toLowerCase();
  const trade = (tradeType || category || '').toLowerCase();

  // Direct subtype matches
  if (/office\s*clean/.test(sub)) return 'Office Clean';

  // Trade / category matches
  if (/clean/.test(sub) || /clean/.test(trade)) return 'Cleaning';
  if (/lawn|mow/.test(sub) || /lawn|mow/.test(trade)) return 'Lawn Mowing';
  if (/pool|spa/.test(sub) || /pool|spa/.test(trade)) return 'Pool Service';
  if (/electric|sparky/.test(trade)) return 'Electrical';
  if (/plumb/.test(trade)) return 'Plumbing';
  if (/paint/.test(trade)) return 'Painting';
  if (/carpent|chippy|cabinet/.test(trade)) return 'Carpentry';
  if (/pest/.test(sub) || /pest/.test(trade)) return 'Pest Control';
  if (/handyman|handy/.test(trade)) return 'Handyman';
  if (/garden|landscap|arborist/.test(trade)) return 'Lawn Mowing';
  if (/roof|gutter/.test(trade)) return 'default';
  if (/air.?con|hvac/.test(trade)) return 'default';
  if (/tile|tiler/.test(trade)) return 'default';

  return 'default';
}

// ---------------------------------------------------------------------------
// Service subcategories for recurring job setup
// ---------------------------------------------------------------------------

export const RECURRING_SERVICE_SUBCATEGORIES: Record<string, string[]> = {
  'Cleaning': [
    'Regular Domestic Clean',
    'Deep Clean',
    'End of Lease Clean',
    'Office Clean',
    'Commercial Clean',
    'Airbnb / Short Stay Turnover',
    'Post Construction Clean',
    'Spring Clean',
    'Move In / Move Out Clean',
    'Body Corporate Clean',
    'Medical / Childcare Clean',
    'School / Education Clean',
  ],
  'Lawn & Garden': [
    'Regular Lawn Mow',
    'Lawn Mow & Edge',
    'Full Garden Maintenance',
    'Hedge Trimming',
    'Lawn Fertilising',
    'Weed Control',
    'Garden Bed Maintenance',
    'Pruning & Trimming',
    'Mulching',
    'Landscaping Maintenance',
  ],
  'Pool & Spa': [
    'Regular Pool Clean',
    'Pool Chemical Balance',
    'Pool Filter Service',
    'Spa Maintenance',
    'Full Pool & Spa Service',
  ],
  'Pest Control': [
    'General Pest Control',
    'Ant Treatment',
    'Cockroach Treatment',
    'Spider Treatment',
    'Termite Inspection',
    'Rodent Control',
    'Bed Bug Treatment',
    'Pre-Purchase Inspection',
  ],
  'Window Cleaning': [
    'Interior Windows',
    'Exterior Windows',
    'Interior & Exterior Windows',
    'High Rise Windows',
    'Commercial Windows',
    'Pressure Washing',
    'Solar Panel Clean',
  ],
  'Carpet & Flooring': [
    'Regular Carpet Clean',
    'Steam Clean',
    'Dry Clean',
    'Stain Treatment',
    'End of Lease Carpet Clean',
    'Upholstery Clean',
    'Tile & Grout Clean',
    'Hardwood Floor Polish',
  ],
  'Gutters & Roof': [
    'Gutter Clean & Flush',
    'Gutter Guard Inspection',
    'Downpipe Clear',
    'Roof Inspection',
    'Roof Wash',
  ],
  'Plumbing': [
    'Regular Maintenance Check',
    'Hot Water Service',
    'Leak Inspection',
    'Drain Maintenance',
    'Backflow Prevention Check',
  ],
  'Electrical': [
    'Safety Inspection',
    'RCD Testing',
    'Emergency Lighting Check',
    'Switchboard Maintenance',
    'Solar System Check',
  ],
  'Air Conditioning & HVAC': [
    'Filter Clean',
    'Full Service & Clean',
    'Gas Top Up',
    'Annual Maintenance',
    'Duct Cleaning',
    'Commercial HVAC Service',
  ],
  'Security': [
    'Alarm System Check',
    'CCTV Maintenance',
    'Access Control Service',
    'Fire Safety Inspection',
  ],
  'Handyman': [
    'Regular Property Maintenance',
    'Painting Touch Up',
    'General Repairs',
    'Seasonal Maintenance',
  ],
};

// ---------------------------------------------------------------------------
// Pre-filled description templates per service subtype
// ---------------------------------------------------------------------------

export const RECURRING_SERVICE_DESCRIPTIONS: Record<string, string> = {
  // ── Cleaning ──────────────────────────────────────────────────────────────
  'Regular Domestic Clean':
    '1. Vacuum and mop all floors\n2. Clean bathrooms including toilet, sink and shower\n3. Wipe down kitchen benches and appliances\n4. Dust surfaces and wipe down furniture\n5. Empty bins throughout the home',
  'Deep Clean':
    '1. Full clean inside oven, fridge and all appliances\n2. Scrub grout, tiles and hard to reach areas in bathrooms\n3. Clean inside cupboards and drawers throughout home\n4. Wash windows, tracks and sills inside\n5. Steam clean or scrub all floors including skirting boards',
  'End of Lease Clean':
    '1. Full internal clean of all rooms to rental standard\n2. Oven, stovetop and rangehood deep clean\n3. Carpet steam clean or hard floor polish\n4. Window clean inside including tracks and sills\n5. Bathroom and toilet scrub to bond return standard',
  'Office Clean':
    '1. Wipe down all desks, monitors and office equipment\n2. Vacuum or mop floors throughout office\n3. Clean kitchen/breakroom including sink, benches and appliances\n4. Clean bathrooms including toilet, sink and mirrors\n5. Empty all bins and replace liners',
  'Commercial Clean':
    '1. Vacuum, sweep and mop all floor areas\n2. Clean and sanitise all bathrooms and amenities\n3. Wipe down all surfaces, desks and common areas\n4. Kitchen and breakroom full clean including appliances\n5. Empty bins and replace liners throughout premises',
  'Airbnb / Short Stay Turnover':
    '1. Strip and remake all beds with fresh linen\n2. Full bathroom clean and restock toiletries\n3. Kitchen clean including dishes, benches and appliances\n4. Vacuum and mop all floors\n5. Check and restock supplies, report any damage',
  'Post Construction Clean':
    '1. Remove all dust and debris from floors, surfaces and sills\n2. Clean all windows, frames and tracks inside\n3. Wipe down all built-in cupboards, shelves and fixtures\n4. Scrub bathrooms and kitchen to remove construction residue\n5. Final vacuum and mop of all floor areas',
  'Spring Clean':
    '1. Deep clean all rooms including behind and under furniture\n2. Wash windows, blinds and curtains\n3. Clean inside all cupboards, wardrobes and storage areas\n4. Degrease kitchen including splashback, oven and rangehood\n5. Scrub bathrooms including grout and tile deep clean',
  'Move In / Move Out Clean':
    '1. Full clean of all rooms, floors and surfaces\n2. Clean inside all cupboards, wardrobes and drawers\n3. Bathroom and toilet scrub to a high standard\n4. Kitchen deep clean including oven and appliances\n5. Vacuum carpets or mop hard floors throughout',
  'Body Corporate Clean':
    '1. Vacuum and mop all common area floors and lobbies\n2. Wipe down lifts, handrails and entry doors\n3. Clean common area bathrooms and amenities\n4. Remove rubbish and clean bin areas\n5. Dust and wipe all common area surfaces and noticeboards',
  'Medical / Childcare Clean':
    '1. Disinfect and sanitise all high touch surfaces\n2. Clean and sanitise bathrooms and amenities to health standard\n3. Vacuum and mop all floors with hospital grade products\n4. Wipe down all equipment, furniture and storage areas\n5. Empty and sanitise all bins with fresh liners',
  'School / Education Clean':
    '1. Vacuum and mop all classroom and corridor floors\n2. Wipe down desks, chairs and whiteboards in all rooms\n3. Clean and sanitise all bathrooms and change rooms\n4. Empty bins throughout and replace liners\n5. Clean staffroom including kitchen benches and appliances',

  // ── Lawn & Garden ─────────────────────────────────────────────────────────
  'Regular Lawn Mow':
    '1. Mow all lawn areas to an even height\n2. Edge along all pathways, driveways and garden beds\n3. Blow or sweep all clippings from hard surfaces\n4. Trim around obstacles such as trees and garden beds\n5. Leave site clean and tidy',
  'Lawn Mow & Edge':
    '1. Mow all lawn areas front and back to even height\n2. Line trim and edge all pathways, driveways and kerbs\n3. Trim around all obstacles including garden beds and fences\n4. Blow all clippings from hard surfaces and drains\n5. Remove or bag all clippings as required',
  'Full Garden Maintenance':
    '1. Mow and edge all lawn areas\n2. Prune and trim all shrubs and hedges\n3. Weed all garden beds and remove debris\n4. Blow down all hard surfaces and pathways\n5. Remove all green waste from site',
  'Hedge Trimming':
    '1. Trim all hedges to desired shape and height\n2. Remove all cuttings and green waste from site\n3. Tidy edges and base of hedges\n4. Check for dead or damaged growth and remove\n5. Blow down surrounding hard surfaces',
  'Lawn Fertilising':
    '1. Assess lawn health and identify any problem areas\n2. Apply appropriate seasonal fertiliser to all lawn areas\n3. Apply weed killer to any broadleaf or clover patches\n4. Water in fertiliser if required\n5. Advise on watering schedule and next treatment',
  'Weed Control':
    '1. Spray or hand-pull weeds from all garden beds\n2. Apply pre-emergent weed treatment where needed\n3. Treat lawn weeds with selective herbicide\n4. Clear weeds from paths, driveways and edges\n5. Dispose of all weed material from site',
  'Garden Bed Maintenance':
    '1. Weed and tidy all garden beds\n2. Prune and shape any overgrown shrubs or plants\n3. Top up mulch to maintain even coverage\n4. Remove dead plants or debris from beds\n5. Edge garden bed borders for a clean finish',
  'Pruning & Trimming':
    '1. Prune all shrubs and small trees to shape\n2. Remove dead, damaged or crossing branches\n3. Thin out dense growth for better airflow\n4. Collect and remove all pruning waste\n5. Blow down hard surfaces and leave site tidy',
  'Mulching':
    '1. Prepare garden beds by weeding and raking\n2. Spread fresh mulch to 75mm depth across all beds\n3. Keep mulch clear of plant stems and tree trunks\n4. Edge around paths and lawn for a clean border\n5. Remove any excess mulch and clean up site',
  'Landscaping Maintenance':
    '1. Mow, edge and blow all lawn areas\n2. Prune and trim all hedges, shrubs and feature plants\n3. Weed and mulch all garden beds as needed\n4. Check irrigation system for leaks or blocked heads\n5. Remove all green waste and leave site tidy',

  // ── Pool & Spa ────────────────────────────────────────────────────────────
  'Regular Pool Clean':
    '1. Skim surface to remove leaves and debris\n2. Vacuum pool floor and walls\n3. Brush pool walls and waterline\n4. Test and balance water chemistry\n5. Check and clean filter basket and pump',
  'Pool Chemical Balance':
    '1. Test water for pH, chlorine, alkalinity and stabiliser\n2. Add chemicals to bring levels into correct range\n3. Check salt chlorinator cell output and condition\n4. Inspect water clarity and treat if cloudy\n5. Record readings and note any concerns',
  'Pool Filter Service':
    '1. Backwash or disassemble and clean filter media\n2. Inspect filter cartridge or sand for wear and replacement\n3. Check filter pressure gauge readings before and after\n4. Inspect multiport valve and O-rings for leaks\n5. Reassemble and return system to normal operation',
  'Spa Maintenance':
    '1. Clean and scrub spa shell and waterline\n2. Test and balance water chemistry\n3. Clean or replace spa filter cartridge\n4. Inspect jets, blower and heater for proper operation\n5. Check sanitiser levels and add as needed',
  'Full Pool & Spa Service':
    '1. Full vacuum, skim and brush of pool and spa\n2. Test and balance all chemical levels\n3. Backwash or clean filter system\n4. Inspect pump, chlorinator and equipment\n5. Report any faults or maintenance required',

  // ── Pest Control ──────────────────────────────────────────────────────────
  'General Pest Control':
    '1. Internal spray of all rooms including skirting boards\n2. External spray around perimeter of building\n3. Treat roof void and sub floor if accessible\n4. Inspect and treat any visible nests or activity\n5. Provide written report of treatment and recommendations',
  'Ant Treatment':
    '1. Identify ant species and locate entry points\n2. Apply targeted bait and barrier spray at entry points\n3. Treat nest sites externally around perimeter\n4. Spray internal skirting boards and affected areas\n5. Advise on prevention measures to reduce re-entry',
  'Cockroach Treatment':
    '1. Apply gel bait in all kitchen and bathroom cabinets\n2. Spray internal skirting boards, cracks and crevices\n3. Treat sub floor and roof void if accessible\n4. External barrier spray around perimeter\n5. Advise on sanitation and moisture reduction',
  'Spider Treatment':
    '1. Web removal from eaves, windows and exterior walls\n2. Spray all exterior surfaces including fences and sheds\n3. Treat internal skirting boards and window frames\n4. Apply barrier spray around doors and entry points\n5. Inspect roof void and garage for redback activity',
  'Termite Inspection':
    '1. Full internal inspection of all rooms and subfloor\n2. External inspection of perimeter and garden areas\n3. Check all timber structures, frames and fencing\n4. Use moisture meter and thermal imaging if required\n5. Provide written report with findings and recommendations',
  'Rodent Control':
    '1. Inspect property for rodent entry points and activity\n2. Set bait stations in strategic locations inside and out\n3. Seal accessible entry points with steel wool or mesh\n4. Check roof void and sub floor for signs of nesting\n5. Schedule follow-up inspection and bait station check',
  'Bed Bug Treatment':
    '1. Inspect mattresses, bed frames and surrounding furniture\n2. Steam treat all affected areas and fabrics\n3. Apply residual insecticide to bed frame and skirting\n4. Treat cracks, crevices and joins in all furniture\n5. Advise on encasements and prevention measures',
  'Pre-Purchase Inspection':
    '1. Full timber pest inspection of all accessible areas\n2. Moisture testing of wet areas and external walls\n3. Inspect sub floor and roof void for pest activity\n4. Check fences, retaining walls and garden structures\n5. Provide detailed written report with photos',

  // ── Window Cleaning ───────────────────────────────────────────────────────
  'Interior Windows':
    '1. Clean all interior glass surfaces streak-free\n2. Wipe down all window frames and sills\n3. Clean sliding door tracks and runners\n4. Remove all marks, fingerprints and residue\n5. Leave all glass spotless and clear',
  'Exterior Windows':
    '1. Clean all exterior glass using purified water or squeegee\n2. Remove cobwebs and debris from window frames\n3. Clean fly screens and replace after cleaning\n4. Wipe down external window sills and ledges\n5. Leave all exterior glass streak-free',
  'Interior & Exterior Windows':
    '1. Clean all window glass inside and outside\n2. Wipe down all window frames and sills\n3. Clean all sliding door tracks and frames\n4. Remove all streaks and water marks\n5. Leave all windows spotless and streak free',
  'High Rise Windows':
    '1. Clean all exterior glass using rope access or elevated platform\n2. Clean interior glass on all levels\n3. Wipe frames, sills and tracks throughout\n4. Remove cobwebs and debris from facades\n5. Leave all glass streak-free and spotless',
  'Commercial Windows':
    '1. Clean all shopfront and office exterior glass\n2. Clean interior glass and partitions\n3. Wipe down frames, sills and entry doors\n4. Remove signage residue and marks\n5. Leave all commercial glass presentation-ready',
  'Pressure Washing':
    '1. Pressure wash all designated hard surfaces\n2. Clean driveways, pathways and entertainment areas\n3. Treat and remove moss, mould and stains\n4. Rinse all surfaces thoroughly\n5. Leave site clean and free of debris',
  'Solar Panel Clean':
    '1. Rinse all solar panels with purified water\n2. Gently scrub panels to remove bird droppings and grime\n3. Check panels for visible damage or hot spots\n4. Clean panel frames and mounting rails\n5. Report on panel condition and any concerns',

  // ── Carpet & Flooring ─────────────────────────────────────────────────────
  'Regular Carpet Clean':
    '1. Pre-vacuum all carpeted areas\n2. Pre-treat stains and high traffic areas\n3. Hot water extraction clean of all carpets\n4. Deodorise and apply stain protection if requested\n5. Leave carpets clean and fresh',
  'Steam Clean':
    '1. Pre-vacuum and pre-treat all stains\n2. Hot water extraction steam clean all areas\n3. Focus on high traffic zones and problem areas\n4. Deodorise and sanitise throughout\n5. Leave carpets damp-dry and fresh',
  'Dry Clean':
    '1. Apply dry cleaning compound to all carpet areas\n2. Agitate compound into carpet fibres with machine\n3. Allow compound to absorb dirt and oils\n4. Vacuum up all compound and residue\n5. Leave carpets dry and ready for immediate use',
  'Stain Treatment':
    '1. Identify stain types and apply appropriate treatment\n2. Pre-treat all stubborn stains with specialist solution\n3. Agitate and extract treated areas\n4. Repeat treatment on persistent stains\n5. Apply stain protection to treated areas',
  'End of Lease Carpet Clean':
    '1. Pre-treat all stains and high traffic areas\n2. Hot water extraction clean of all carpeted areas\n3. Deodorise and sanitise throughout\n4. Clean carpet edges and along skirting boards\n5. Leave carpets to bond return standard',
  'Upholstery Clean':
    '1. Pre-vacuum all upholstered furniture\n2. Pre-treat stains and soiled areas\n3. Steam clean or dry clean all upholstery\n4. Deodorise and apply fabric protection\n5. Leave furniture clean and fresh',
  'Tile & Grout Clean':
    '1. Sweep and pre-treat all tiled areas\n2. Scrub grout lines with rotary machine\n3. High pressure clean tile surfaces\n4. Extract dirty water and residue\n5. Apply grout sealer to all cleaned areas',
  'Hardwood Floor Polish':
    '1. Clean and prepare all timber floor surfaces\n2. Buff floors with fine abrasive pad\n3. Apply fresh coat of floor polish or sealant\n4. Allow to cure and apply second coat if required\n5. Leave floors polished and protected',

  // ── Gutters & Roof ────────────────────────────────────────────────────────
  'Gutter Clean & Flush':
    '1. Remove all leaves and debris from gutters by hand\n2. Flush all gutters and downpipes with water\n3. Check downpipes for blockages and clear\n4. Inspect gutter condition and note any damage\n5. Leave all gutters flowing freely',
  'Gutter Guard Inspection':
    '1. Inspect all gutter guard mesh for damage or gaps\n2. Remove debris sitting on top of guards\n3. Check guard fixings and re-secure any loose sections\n4. Flush gutters underneath guards to confirm flow\n5. Report on guard condition and recommend replacements',
  'Downpipe Clear':
    '1. Check all downpipes for blockages and debris\n2. Flush each downpipe from top with water pressure\n3. Clear any stubborn blockages with plumber snake\n4. Inspect downpipe joins and brackets for damage\n5. Confirm free flow from gutter to stormwater',
  'Roof Inspection':
    '1. Visual inspection of all roof surfaces for damage\n2. Check ridge capping, tiles and flashings\n3. Inspect valleys and penetrations for leaks\n4. Check gutter and downpipe condition\n5. Provide written report with photos and recommendations',
  'Roof Wash':
    '1. Soft wash or pressure clean all roof surfaces\n2. Remove moss, lichen and mould from tiles\n3. Clean valleys, ridges and flashings\n4. Treat roof with anti-fungal solution\n5. Rinse all surfaces and check for damage',

  // ── Plumbing ──────────────────────────────────────────────────────────────
  'Regular Maintenance Check':
    '1. Inspect all taps, toilets and fixtures for leaks\n2. Check hot water system temperature and pressure relief valve\n3. Test water pressure at key outlets\n4. Inspect visible pipes under sinks for corrosion or leaks\n5. Provide report on any issues found and recommended repairs',
  'Hot Water Service':
    '1. Flush hot water system tank to remove sediment\n2. Test temperature and pressure relief valve\n3. Check anode rod condition and advise on replacement\n4. Inspect all connections and fittings for leaks\n5. Test water temperature at outlets and adjust if needed',
  'Leak Inspection':
    '1. Visual inspection of all accessible plumbing\n2. Test water meter for hidden leaks\n3. Check under all sinks, basins and vanities\n4. Inspect toilet cisterns and connections\n5. Provide report on findings with repair recommendations',
  'Drain Maintenance':
    '1. Inspect all floor drains and grates for blockages\n2. Flush drains with high pressure jet if accessible\n3. Check traps under sinks and basins\n4. Clear any slow-draining outlets\n5. Advise on drain condition and any further work needed',
  'Backflow Prevention Check':
    '1. Test backflow prevention device as per council requirements\n2. Check valve operation and seal condition\n3. Record test results on official test report\n4. Tag device with test date and next due\n5. Submit test report to local water authority',

  // ── Electrical ────────────────────────────────────────────────────────────
  'Safety Inspection':
    '1. Test all power points and light switches for faults\n2. Inspect switchboard for compliance and safety\n3. Test all RCDs and circuit breakers\n4. Check all smoke alarm batteries and expiry dates\n5. Provide written electrical safety report',
  'RCD Testing':
    '1. Test all residual current devices for trip time\n2. Record trip times against Australian Standard requirements\n3. Identify any non-compliant or faulty RCDs\n4. Test reset function on all devices\n5. Provide test certificate with results',
  'Emergency Lighting Check':
    '1. Test all emergency and exit lights for function\n2. Conduct 90-minute discharge test as required\n3. Check battery condition and charge levels\n4. Replace any failed lamps or batteries\n5. Tag all tested lights with date and results',
  'Switchboard Maintenance':
    '1. Visual inspection of switchboard for damage or heat\n2. Tighten all connections and terminal screws\n3. Check circuit breaker operation and labelling\n4. Test main switch and RCD devices\n5. Clean switchboard and update circuit directory',
  'Solar System Check':
    '1. Inspect all solar panels for damage or soiling\n2. Check inverter operation and error codes\n3. Test system output against expected performance\n4. Inspect all DC isolators and wiring connections\n5. Provide report on system health and output',

  // ── Air Conditioning & HVAC ───────────────────────────────────────────────
  'Filter Clean':
    '1. Remove and clean all return air filters\n2. Wash filters with water and mild detergent\n3. Dry filters completely before reinstalling\n4. Check filter condition and advise on replacement\n5. Reinstall filters and test airflow',
  'Full Service & Clean':
    '1. Clean and wash all filters throughout\n2. Clean indoor and outdoor units\n3. Check refrigerant levels and system pressures\n4. Inspect all electrical connections and components\n5. Test full operation and report any faults',
  'Gas Top Up':
    '1. Check system refrigerant levels and pressures\n2. Leak test all joints and connections\n3. Top up refrigerant gas to manufacturer specification\n4. Test cooling and heating performance after top up\n5. Record gas type and quantity added',
  'Annual Maintenance':
    '1. Clean all filters, coils and drain pans\n2. Check refrigerant charge and system pressures\n3. Inspect all electrical connections and controls\n4. Test thermostat and all operating modes\n5. Provide full service report with recommendations',
  'Duct Cleaning':
    '1. Inspect all ductwork for dust, mould and debris\n2. Vacuum and brush clean all supply and return ducts\n3. Clean all grilles, registers and diffusers\n4. Sanitise ductwork with anti-bacterial treatment\n5. Test airflow after cleaning and report findings',
  'Commercial HVAC Service':
    '1. Inspect and service all rooftop or plant room units\n2. Clean coils, filters and drain systems\n3. Check refrigerant levels and compressor operation\n4. Test all controls, thermostats and BMS integration\n5. Provide detailed service report with recommendations',

  // ── Security ──────────────────────────────────────────────────────────────
  'Alarm System Check':
    '1. Test all alarm sensors including PIR and reed switches\n2. Test siren and strobe operation\n3. Check panel battery backup and charge level\n4. Test communication to monitoring station\n5. Provide test report and note any faults',
  'CCTV Maintenance':
    '1. Clean all camera lenses and housings\n2. Check camera angles and adjust as needed\n3. Test recording quality and playback on all cameras\n4. Check DVR/NVR storage capacity and operation\n5. Test remote viewing access and connectivity',
  'Access Control Service':
    '1. Test all card readers and keypads for response\n2. Check door lock mechanisms and strikes\n3. Review access logs and user permissions\n4. Test emergency release and fire integration\n5. Update firmware and report any faults',
  'Fire Safety Inspection':
    '1. Test all smoke alarms and replace batteries\n2. Inspect fire extinguishers and check expiry tags\n3. Test emergency exit lights and battery backup\n4. Check fire door operation and seals\n5. Provide compliance report with recommendations',

  // ── Handyman ──────────────────────────────────────────────────────────────
  'Regular Property Maintenance':
    '1. Inspect and repair any minor faults throughout property\n2. Check and tighten all door handles, hinges and locks\n3. Touch up any minor paint marks or scuffs\n4. Check gutters, downpipes and exterior for issues\n5. Report any major maintenance items requiring attention',
  'Painting Touch Up':
    '1. Sand and prepare all areas with chips, scuffs or marks\n2. Apply primer to any bare or patched areas\n3. Touch up paint to match existing colour throughout\n4. Clean up all edges and transitions between colours\n5. Leave all areas clean and even finish',
  'General Repairs':
    '1. Fix any reported minor issues around the property\n2. Repair or replace damaged door hardware and fixtures\n3. Patch small holes in walls and touch up paint\n4. Tighten loose fittings, shelves and fixtures\n5. Test all repairs and leave site clean',
  'Seasonal Maintenance':
    '1. Check and clean gutters and downpipes\n2. Inspect exterior paint, caulk and seals for wear\n3. Test smoke alarms and replace batteries\n4. Check weatherstripping on all doors and windows\n5. Inspect deck, fencing and outdoor structures',

  // ── Trades without subcategories in RECURRING_SERVICE_SUBCATEGORIES ─────
  // Painting
  'Painting':
    '1. Prepare all surfaces including sanding, filling and priming\n2. Apply two coats of paint to all agreed areas\n3. Cut in around all edges, trims and fixtures\n4. Protect floors, furniture and fittings during work\n5. Clean up all equipment and leave site tidy',
  // Carpentry
  'Carpentry':
    '1. Inspect all timber structures for damage or rot\n2. Repair or replace damaged timber as needed\n3. Sand, oil or stain all timber surfaces\n4. Check and tighten all fixings and hardware\n5. Leave all timber surfaces treated and protected',
  // Tiling
  'Tiling':
    '1. Inspect all tiled surfaces for cracked or loose tiles\n2. Re-grout any deteriorated grout lines\n3. Seal grout and tile surfaces to prevent water damage\n4. Replace any cracked or damaged tiles\n5. Clean all tiled areas and leave site tidy',
  // Flooring
  'Flooring':
    '1. Inspect all floor surfaces for damage or wear\n2. Sand and refinish timber floors as required\n3. Replace any damaged boards, tiles or vinyl\n4. Apply sealant or polish to protect floor surfaces\n5. Leave all floors clean and ready for use',
  // Concreting
  'Concreting':
    '1. Inspect all concrete surfaces for cracks or damage\n2. Clean and prepare surfaces for sealing\n3. Apply concrete sealer to all designated areas\n4. Repair any minor cracks or chips\n5. Leave all concrete surfaces sealed and protected',
  // Fencing
  'Fencing':
    '1. Inspect all fence posts, rails and palings for damage\n2. Re-secure any loose palings or panels\n3. Treat timber with stain, oil or paint as needed\n4. Check and repair gate hinges, latches and locks\n5. Leave all fencing secure and treated',
  // Decking
  'Decking':
    '1. Inspect deck boards, joists and fixings for damage or rot\n2. Sand deck surface to remove grey or rough timber\n3. Apply oil, stain or sealant to all deck surfaces\n4. Check and tighten all screws and brackets\n5. Clean balustrades, stairs and edges',
  // Rendering
  'Rendering':
    '1. Inspect all rendered surfaces for cracks or bubbling\n2. Patch and repair any damaged render areas\n3. Clean all render surfaces of dirt and mould\n4. Apply fresh paint or sealant coat as needed\n5. Leave all rendered surfaces clean and sealed',
  // Waterproofing
  'Waterproofing':
    '1. Inspect all wet area membranes for damage or wear\n2. Check balcony and deck membranes for cracking\n3. Test shower recesses and bath surrounds for leaks\n4. Inspect below-grade walls for moisture ingress\n5. Provide report with recommendations for remediation',
  // Bricklaying
  'Bricklaying':
    '1. Inspect all brickwork for cracked or loose mortar joints\n2. Re-point deteriorated mortar joints as needed\n3. Check for rising damp or water damage in brick walls\n4. Clean and treat any efflorescence or staining\n5. Leave all brickwork structurally sound and clean',
  // Plastering
  'Plastering':
    '1. Inspect all walls and ceilings for cracks or damage\n2. Patch and fill any holes, dents or cracks\n3. Sand all repaired areas smooth and even\n4. Apply finishing coat to blend with surrounding surfaces\n5. Leave all surfaces ready for painting',
  // Insulation
  'Insulation':
    '1. Inspect existing insulation in roof and wall cavities\n2. Check for gaps, compression or damage in batts\n3. Top up or replace insulation in problem areas\n4. Check for moisture, pests or mould in cavities\n5. Provide report on insulation condition and R-value',
  // Solar
  'Solar':
    '1. Clean all solar panels with purified water\n2. Inspect panel mountings and frames for corrosion\n3. Check inverter operation and error logs\n4. Test system output and compare to expected generation\n5. Provide report on system performance and condition',
  // Gas Fitting
  'Gas Fitting':
    '1. Test all gas appliances for correct operation\n2. Check gas line connections for leaks with detector\n3. Inspect gas meter and regulator condition\n4. Test gas pressure at appliance connections\n5. Provide gas safety certificate and report',
  // Appliance Repair
  'Appliance Repair':
    '1. Diagnose reported fault on appliance\n2. Inspect all components and connections\n3. Clean filters, vents and accessible parts\n4. Repair or advise on part replacement\n5. Test appliance operation after service',
  // Locksmith
  'Locksmith':
    '1. Inspect all door and window locks throughout property\n2. Test all locks for smooth operation\n3. Lubricate and adjust lock mechanisms as needed\n4. Re-key or replace any faulty locks\n5. Test all keys and provide spares if requested',
  // Removalist
  'Removalist':
    '1. Wrap and protect all furniture and fragile items\n2. Load all items safely and securely onto truck\n3. Transport to new location with care\n4. Unload and place all items in designated rooms\n5. Remove all packing materials and leave site tidy',
  // Landscaping
  'Landscaping':
    '1. Mow, edge and blow all lawn areas\n2. Prune and shape all shrubs, hedges and feature plants\n3. Weed and mulch all garden beds\n4. Check and adjust irrigation system as needed\n5. Remove all green waste and leave site tidy',
  // Irrigation
  'Irrigation':
    '1. Inspect all sprinkler heads and drip lines\n2. Check controller programming and adjust schedules\n3. Replace any broken or blocked sprinkler heads\n4. Test each zone for correct coverage and pressure\n5. Check for leaks and repair any damaged lines',
  // Tree Removal
  'Tree Removal':
    '1. Assess tree health and plan safe removal method\n2. Section and fell tree safely with all precautions\n3. Remove all branches and trunk from site\n4. Grind stump below ground level if required\n5. Clean up all debris and leave site level and tidy',
  // Demolition
  'Demolition':
    '1. Set up safety barriers and containment as required\n2. Disconnect and cap all services safely\n3. Strip out internal fixtures, fittings and materials\n4. Demolish structure as per scope of work\n5. Remove all waste from site and leave clean and level',
  // Excavation
  'Excavation':
    '1. Mark out dig area and confirm service locations\n2. Excavate to required depth and dimensions\n3. Grade and compact base as required\n4. Remove or stockpile excavated material\n5. Leave site clean and ready for next stage of work',
  // Skip Bin
  'Skip Bin':
    '1. Deliver skip bin to agreed location on property\n2. Place bin on boards to protect driveway surface\n3. Allow agreed hire period for filling\n4. Collect full bin and transport to waste facility\n5. Sort and dispose of waste responsibly',
  // Assembly
  'Assembly':
    '1. Unpack all components and check against instructions\n2. Assemble item following manufacturer guidelines\n3. Secure all fixings, bolts and fasteners properly\n4. Anchor to wall or floor if required for safety\n5. Test operation and leave assembly area clean',
  // Stonemasonry
  'Stonemasonry':
    '1. Inspect all stonework for cracking, movement or damage\n2. Clean stone surfaces of dirt, moss and staining\n3. Re-point mortar joints where deteriorated\n4. Repair or replace any cracked or chipped stones\n5. Apply sealant to protect stone from weather damage',
  // Glazier
  'Glazier':
    '1. Inspect all glass panels and frames for damage\n2. Replace any cracked or broken glass panels\n3. Check window and door seals for drafts or leaks\n4. Adjust sliding door rollers and tracks\n5. Clean all new and repaired glass on completion',
  // Cabinet Maker
  'Cabinet Maker':
    '1. Inspect all cabinets, drawers and doors for wear\n2. Adjust hinges and drawer slides for smooth operation\n3. Repair or replace any damaged shelves or panels\n4. Check and tighten all handles and knobs\n5. Clean and polish all cabinet surfaces',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecurringJobData {
  client_id?: string;
  tradie_id?: string | null;
  trade_category: string;
  service_subtype?: string;
  description: string;
  frequency_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active?: boolean;
  original_job_id?: string;
  location?: string;
  agreed_price?: number;
  day_of_week?: number;
  preferred_time?: string;
  billing_cycle?: 'fortnightly' | 'monthly';
  supplies?: Record<string, unknown>[];
  consumables_provider?: 'client' | 'tradie_billed';
}

export interface RecurringJob {
  id: string;
  client_id: string;
  tradie_id: string;
  trade_category: string;
  service_subtype?: string;
  description: string;
  frequency_months: number;
  next_due_date: string;
  reminder_days_before: number;
  is_active: boolean;
  original_job_id: string | null;
  times_completed: number;
  created_at: string;
  updated_at: string;
  location?: string;
  agreed_price?: number;
  day_of_week?: number;
  preferred_time?: string;
  billing_cycle?: 'fortnightly' | 'monthly';
  last_invoiced_at?: string;
  cancelled_at?: string | null;
  auto_accept?: boolean | null;
  auto_invoice?: boolean;
  end_date?: string | null;
  supplies?: Record<string, unknown>[];
  consumables_provider?: 'client' | 'tradie_billed';
  assigned_team_member_id?: string | null;
  assigned_team_member?: {
    id: string;
    invite_name: string;
    member_profile_id: string | null;
  } | null;
  tradie?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  // Owning business (populated for the assigned-worker view)
  owner?: {
    id: string;
    full_name: string;
    tradie_details?: { business_name: string | null } | { business_name: string | null }[] | null;
  } | null;
}

export type RecurringSessionStatus = 'pending_confirmation' | 'scheduled' | 'awaiting_completion' | 'completed' | 'rescheduled' | 'skipped' | 'extra';

export interface RecurringSession {
  id: string;
  recurring_job_id: string;
  scheduled_date: string;
  actual_date: string | null;
  status: RecurringSessionStatus;
  extra_hours: number | null;
  extra_cost: number | null;
  reschedule_reason: string | null;
  reschedule_by: 'client' | 'tradie' | null;
  notes: string | null;
  confirmation_deadline: string | null;
  start_time: string | null;
  end_time: string | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  time_proposal_by: 'client' | 'tradie' | null;
  supply_cost?: number;
  supplies_used?: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface RecurringJobSuggestion {
  tradeCategory: string;
  frequencyMonths: number;
  label: string;
  description: string;
  priceRange?: { min: number; max: number; unit: string };
}

export interface DueReminder {
  id: string;
  trade_category: string;
  description: string;
  next_due_date: string;
  reminder_days_before: number;
  tradie_name: string;
  tradie_id: string;
  days_until_due: number;
}

// ---------------------------------------------------------------------------
// Default frequencies (months) by trade category
// ---------------------------------------------------------------------------

// Frequency conventions: positive = months, -1 = weekly (7 days), -2 = fortnightly (14 days), -3 = daily
export const FREQ_DAILY = -3;
export const FREQ_WEEKLY = -1;
export const FREQ_FORTNIGHTLY = -2;

export const DEFAULT_FREQUENCIES: Record<string, number> = {
  // Weekly services
  cleaning_weekly: FREQ_WEEKLY,
  regular_house_clean: FREQ_WEEKLY,
  lawn_mowing_weekly: FREQ_WEEKLY,
  regular_mowing: FREQ_WEEKLY,
  pool_maintenance_weekly: FREQ_WEEKLY,
  chemical_balancing: FREQ_WEEKLY,
  // Fortnightly services
  cleaning_fortnightly: FREQ_FORTNIGHTLY,
  lawn_mowing_fortnightly: FREQ_FORTNIGHTLY,
  garden_maintenance_fortnightly: FREQ_FORTNIGHTLY,
  hedge_trimming: FREQ_FORTNIGHTLY,
  mulching_and_weeding: FREQ_FORTNIGHTLY,
  garden_tidy_up: FREQ_FORTNIGHTLY,
  // Monthly services
  cleaning: 1,
  office_clean: 1,
  commercial_clean: 1,
  strata_common_areas: 1,
  lawn_mowing: 1,
  property_maintenance: 1,
  filter_and_pump_service: 1,
  filter_replacement: 1,
  filter_clean_and_gas_top_up: 1,
  regular_aircon_service: 3,
  regular_hvac_service: 3,
  // Quarterly services
  landscaping: 3,
  pool_maintenance: 3,
  garden_maintenance: 3,
  oven_and_bbq_clean: 3,
  regular_tree_maintenance: 3,
  // Biannual services
  gutter_cleaning: 6,
  window_cleaning: 6,
  carpet_cleaning: 6,
  roof_inspection: 6,
  dryer_vent_clean: 6,
  floor_polishing_and_reseal: 6,
  // Annual services
  plumbing: 12,
  backflow_testing: 12,
  septic_pump_out: 12,
  pest_control: 12,
  general_pest_treatment: 12,
  hvac: 12,
  air_conditioning: 12,
  solar: 12,
  panel_cleaning_and_inspection: 12,
  fire_safety: 12,
  smoke_alarm_testing: 12,
  fire_extinguisher_service: 12,
  exit_light_inspection: 12,
  hot_water_service: 12,
  system_flush: 12,
  anode_rod_check: 12,
  septic_tank: 12,
  chimney_sweep: 12,
  chimney_clean: 12,
  garage_doors: 12,
  annual_service: 12,
  security_systems: 12,
  annual_alarm_testing: 12,
  appliance_service: 12,
  safety_inspection: 12,
  rcd_testing: 12,
  concrete_sealing: 12,
  fence_staining: 12,
  grout_and_reseal: 12,
  membrane_inspection: 12,
  // Biennial services
  electrical: 24,
  roofing: 24,
  waterproofing: 24,
  tree_lopping: 24,
  termite_inspection: 24,
  termite_barrier: 24,
  timber_maintenance: 24,
  touch_up_service: 24,
  // 3-year services
  carpentry: 36,
  fencing: 36,
  concreting: 36,
  tiling: 36,
  // 5-year services
  painting: 60,
  rendering: 60,
} as const;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the next due date by adding frequency months to the last
 * completed date.
 */
export function calculateNextDueDate(
  lastCompleted: Date | string,
  frequencyMonths: number,
): Date {
  const base = typeof lastCompleted === 'string' ? new Date(lastCompleted) : lastCompleted;
  const next = new Date(base);
  if (frequencyMonths === FREQ_DAILY) {
    next.setDate(next.getDate() + 1);
  } else if (frequencyMonths === FREQ_WEEKLY) {
    next.setDate(next.getDate() + 7);
  } else if (frequencyMonths === FREQ_FORTNIGHTLY) {
    next.setDate(next.getDate() + 14);
  } else if (frequencyMonths > 0) {
    // Clamp to last day of target month to prevent drift (e.g. Jan 31 + 1m = Feb 28)
    const targetDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + frequencyMonths);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, lastDay));
  }
  return next;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new recurring job.
 */
export async function createRecurringJob(
  data: RecurringJobData,
): Promise<RecurringJob> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // If linked to an original job and no tradie specified, inherit the tradie from that job
  let resolvedTradieId = data.tradie_id || null;
  if (!resolvedTradieId && data.original_job_id) {
    const { data: origJob } = await supabase
      .from('jobs')
      .select('tradie_id')
      .eq('id', data.original_job_id)
      .maybeSingle();
    if (origJob?.tradie_id) {
      resolvedTradieId = origJob.tradie_id;
    }
  }

  const insertPayload: Record<string, unknown> = {
    client_id: data.client_id ?? user.id,
    tradie_id: resolvedTradieId,
    trade_category: data.trade_category,
    description: data.description,
    frequency_months: data.frequency_months,
    next_due_date: data.next_due_date,
    reminder_days_before: data.reminder_days_before,
    is_active: data.is_active ?? true,
    original_job_id: data.original_job_id ?? null,
    times_completed: 0,
  };

  if (data.service_subtype) insertPayload.service_subtype = data.service_subtype;
  if (data.location) insertPayload.location = data.location;
  if (data.agreed_price != null) insertPayload.agreed_price = data.agreed_price;
  if (data.day_of_week != null) insertPayload.day_of_week = data.day_of_week;
  if (data.preferred_time) insertPayload.preferred_time = data.preferred_time;
  if (data.billing_cycle) insertPayload.billing_cycle = data.billing_cycle;
  if (data.supplies && data.supplies.length > 0) insertPayload.supplies = data.supplies;
  if (data.consumables_provider) insertPayload.consumables_provider = data.consumables_provider;

  const { data: created, error } = await supabase
    .from('recurring_jobs')
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Capture raw description for keyword analytics (fire-and-forget)
  if (data.description && data.service_subtype) {
    supabase
      .from('service_description_raw')
      .insert({
        service_type: data.service_subtype,
        trade_category: data.trade_category,
        description: data.description,
        client_id: data.client_id ?? user.id,
      })
      .then(({ error: rawErr }) => {
        if (rawErr) console.warn('Failed to capture description for analytics:', rawErr.message);
      });
  }

  const rj = created as unknown as RecurringJob;

  // Back-link the originating job to this recurring service. Without this, the
  // job→recurring link is one-way and downstream flows that key off
  // jobs.recurring_job_id (e.g. accept-and-pay syncing the assigned tradie + agreed
  // rate onto the service) silently no-op, leaving the service as "no tradie assigned".
  if (data.original_job_id) {
    try {
      await supabase
        .from('jobs')
        .update({ recurring_job_id: rj.id })
        .eq('id', data.original_job_id);
    } catch { /* Non-critical back-link */ }
  }

  // If a preferred tradie was assigned, update the original job record so the
  // client-side status reflects "Tradie Assigned" instead of "Awaiting Quotes"
  if (resolvedTradieId && data.original_job_id) {
    try {
      await supabase
        .from('jobs')
        .update({ tradie_id: resolvedTradieId, quoting_status: 'awarded', status: 'accepted' })
        .eq('id', data.original_job_id);
    } catch {
      // Non-critical — display only
    }
  }

  // Auto-create first session for the start date (only if a tradie is assigned)
  if (resolvedTradieId) {
    try {
      const confirmationDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await supabase.from('recurring_sessions').insert({
        recurring_job_id: rj.id,
        scheduled_date: data.next_due_date,
        status: 'pending_confirmation',
        confirmation_deadline: confirmationDeadline,
      });
    } catch {
      // Non-critical
    }
  }

  // Notify tradie if assigned
  if (resolvedTradieId) {
    try {
      const tradeLabel = (data.service_subtype || data.trade_category)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const dateLabel = new Date(data.next_due_date + 'T00:00:00').toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      await insertNotification(
        resolvedTradieId,
        'recurring_job_confirmation_required',
        `New recurring ${tradeLabel} service starting ${dateLabel}. Please confirm within 48 hours.`,
        { recurring_job_id: rj.id, next_date: data.next_due_date },
      );
    } catch {
      // Non-critical
    }
  }

  // Auto-create service agreement
  try {
    const freqMap: Record<number, string> = { [-3]: 'daily', [-1]: 'weekly', [-2]: 'fortnightly', 1: 'monthly' };
    await supabase.from('service_agreements').insert({
      client_id: data.client_id ?? user.id,
      tradie_id: data.tradie_id || user.id,
      title: data.service_subtype || data.trade_category,
      description: data.description,
      trade_category: data.trade_category,
      address: data.location || '',
      rate_per_visit: data.agreed_price || 0,
      typical_frequency: freqMap[data.frequency_months] || 'weekly',
      typical_time: data.preferred_time || null,
      status: 'active',
    });
  } catch {
    // Non-critical
  }

  return rj;
}

// ---------------------------------------------------------------------------
// Keyword Suggestions
// ---------------------------------------------------------------------------

export interface KeywordSuggestion {
  keyword: string;
  frequency: number;
  /** Detailed task line inserted when the chip is clicked (falls back to keyword). */
  detail: string | null;
}

/**
 * Fetch top keyword suggestions for a given service type.
 * Returns keywords ordered by frequency (most popular first).
 */
export async function getKeywordSuggestions(
  serviceType: string,
  limit = 15,
): Promise<KeywordSuggestion[]> {
  const { data, error } = await supabase
    .from('service_description_keywords')
    .select('keyword, frequency, detail')
    .eq('service_type', serviceType)
    .order('frequency', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Failed to fetch keyword suggestions:', error.message);
    return [];
  }

  return (data ?? []) as KeywordSuggestion[];
}

/**
 * Fetch all recurring jobs where this user is the tradie.
 */
export async function getTradieRecurringJobs(tradieId: string): Promise<RecurringJob[]> {
  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      *,
      client:profiles!recurring_jobs_client_id_fkey(id, full_name, email, phone),
      assigned_team_member:business_team_members!recurring_jobs_assigned_team_member_id_fkey(id, invite_name, member_profile_id)
    `)
    .eq('tradie_id', tradieId)
    .is('cancelled_at', null)
    .order('next_due_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as RecurringJob[]) ?? [];
}

/**
 * Fetch ongoing services a user is ASSIGNED to as a team worker (not the owner).
 * Read-only view — the owning tradie still controls the service. Includes the
 * owning business name so the worker knows who assigned it.
 */
export async function getAssignedRecurringJobs(userId: string): Promise<RecurringJob[]> {
  const { data: memberships } = await supabase
    .from('business_team_members')
    .select('id')
    .eq('member_profile_id', userId);
  const memberIds = (memberships ?? []).map(m => m.id);
  if (memberIds.length === 0) return [];

  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      *,
      client:profiles!recurring_jobs_client_id_fkey(id, full_name, email, phone),
      owner:profiles!recurring_jobs_tradie_id_fkey(id, full_name, tradie_details(business_name)),
      assigned_team_member:business_team_members!recurring_jobs_assigned_team_member_id_fkey(id, invite_name, member_profile_id)
    `)
    .in('assigned_team_member_id', memberIds)
    .is('cancelled_at', null)
    .order('next_due_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as RecurringJob[]) ?? [];
}

/** Upcoming visits for the services a user is assigned to (worker view). */
export async function getAssignedUpcomingSessions(userId: string, limit = 30) {
  const { data: memberships } = await supabase
    .from('business_team_members')
    .select('id')
    .eq('member_profile_id', userId);
  const memberIds = (memberships ?? []).map(m => m.id);
  if (memberIds.length === 0) return [];

  const { data: jobs } = await supabase
    .from('recurring_jobs')
    .select('id')
    .in('assigned_team_member_id', memberIds)
    .is('cancelled_at', null);
  const jobIds = (jobs ?? []).map(j => j.id);
  if (jobIds.length === 0) return [];

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 7);
  const lookbackDate = lookback.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select(`
      *,
      recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
        trade_category, service_subtype, description, client_id, preferred_time,
        agreed_price, auto_accept, location, frequency_months, billing_cycle,
        last_invoiced_at, supplies, is_active, cancelled_at, tradie_id,
        client:profiles!recurring_jobs_client_id_fkey(full_name, phone, email)
      )
    `)
    .in('recurring_job_id', jobIds)
    .in('status', ['pending_confirmation', 'scheduled', 'awaiting_completion'])
    .gte('scheduled_date', lookbackDate)
    .order('scheduled_date', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Awaited<ReturnType<typeof getTradieUpcomingSessions>>;
}

/**
 * Fetch all recurring jobs for a user, including tradie info.
 */
export async function getRecurringJobs(userId?: string): Promise<RecurringJob[]> {
  let uid = userId;

  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }

  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      *,
      tradie:profiles!recurring_jobs_tradie_id_fkey(id, full_name, email)
    `)
    .eq('client_id', uid)
    .order('next_due_date', { ascending: true });

  if (error) throw new Error(error.message);

  return (data as unknown as RecurringJob[]) ?? [];
}

/**
 * Update fields on a recurring job.
 */
export async function updateRecurringJob(
  id: string,
  data: Partial<RecurringJobData>,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};

  if (data.trade_category !== undefined) updatePayload.trade_category = data.trade_category;
  if (data.service_subtype !== undefined) updatePayload.service_subtype = data.service_subtype;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.frequency_months !== undefined) updatePayload.frequency_months = data.frequency_months;
  if (data.next_due_date !== undefined) updatePayload.next_due_date = data.next_due_date;
  if (data.reminder_days_before !== undefined) updatePayload.reminder_days_before = data.reminder_days_before;
  if (data.tradie_id !== undefined) updatePayload.tradie_id = data.tradie_id;
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;
  if (data.location !== undefined) updatePayload.location = data.location;
  if (data.agreed_price !== undefined) updatePayload.agreed_price = data.agreed_price;
  if (data.day_of_week !== undefined) updatePayload.day_of_week = data.day_of_week;
  if (data.preferred_time !== undefined) updatePayload.preferred_time = data.preferred_time;
  if (data.billing_cycle !== undefined) updatePayload.billing_cycle = data.billing_cycle;

  const { error } = await supabase
    .from('recurring_jobs')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Request a quote for an existing ongoing service.
 * Creates a new `jobs` row linked back to the recurring service and notifies the assigned tradie
 * (or, if no tradie is assigned, notifies all saved tradies matching the trade).
 *
 * Returns the created job id so the caller can refetch.
 */
export async function requestQuoteForRecurringJob(
  recurringJob: RecurringJob,
  clientName: string,
  savedMatchingTradies?: { id: string }[],
): Promise<{ jobId: string }> {
  const tradeName = recurringJob.trade_category.replace(/_/g, ' ');
  const serviceLabel = recurringJob.service_subtype || tradeName;

  const { data: insertedJob, error: insertError } = await supabase
    .from('jobs')
    .insert({
      client_id: recurringJob.client_id,
      title: `${serviceLabel} — Ongoing Service`,
      description: `[${recurringJob.trade_category}] ${recurringJob.description}`,
      status: 'pending',
      location_address: recurringJob.location || null,
      budget_type: recurringJob.agreed_price ? 'fixed_budget' : 'request_quote',
      budget_amount: recurringJob.agreed_price || null,
      is_emergency: false,
      priority: 'normal',
      is_delayed: false,
      max_quotes: 5,
      recurring_job_id: recurringJob.id,
      tradie_id: recurringJob.tradie_id || null,
    })
    .select('id')
    .single();

  if (insertError || !insertedJob) {
    throw new Error(insertError?.message || 'Failed to create quote request');
  }

  const jobId = insertedJob.id as string;

  if (recurringJob.tradie_id) {
    await supabase.rpc('create_notification', {
      p_user_id: recurringJob.tradie_id,
      p_title: 'New quote request',
      p_message: `${clientName} sent you an ongoing ${tradeName} service — review and quote now`,
      p_type: 'new_job',
      p_channel: 'in_app',
      p_read: false,
      p_link: null,
      p_job_id: jobId,
      p_metadata: { recurring_job_id: recurringJob.id },
    });
  } else if (savedMatchingTradies && savedMatchingTradies.length > 0) {
    await Promise.all(savedMatchingTradies.map(t => supabase.rpc('create_notification', {
      p_user_id: t.id,
      p_title: 'New quote request from a saved client',
      p_message: `${clientName} is looking for a ${tradeName} — ongoing service`,
      p_type: 'new_job',
      p_channel: 'in_app',
      p_read: false,
      p_link: null,
      p_job_id: jobId,
      p_metadata: { recurring_job_id: recurringJob.id },
    })));
  }

  return { jobId };
}

/**
 * Pause a recurring job — hides it from active views but preserves sessions and agreements.
 * The service can be resumed later.
 */
export async function pauseRecurringJob(id: string, pausedByRole?: 'client' | 'tradie'): Promise<void> {
  const { data: job, error: fetchError } = await supabase
    .from('recurring_jobs')
    .select('id, client_id, tradie_id, trade_category, service_subtype')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from('recurring_jobs')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Cancel pending/scheduled sessions so auto-confirm doesn't complete them
  try {
    await supabase
      .from('recurring_sessions')
      .update({ status: 'skipped', reschedule_reason: 'Service paused', confirmation_deadline: null })
      .eq('recurring_job_id', id)
      .in('status', ['pending_confirmation', 'scheduled']);
  } catch { /* Non-critical */ }

  // Notify the other party
  if (job) {
    const tradeLabel = (job.service_subtype || job.trade_category || 'service')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    try {
      if (pausedByRole === 'client' && job.tradie_id) {
        await insertNotification(
          job.tradie_id,
          'recurring_paused',
          `Your client has paused the ${tradeLabel} service. Upcoming sessions are on hold.`,
          { recurring_job_id: id },
        );
      } else if (pausedByRole === 'tradie' && job.client_id) {
        await insertNotification(
          job.client_id,
          'recurring_paused',
          `Your tradie has paused the ${tradeLabel} service. Upcoming sessions are on hold.`,
          { recurring_job_id: id },
        );
      }
    } catch {
      // Non-critical
    }
  }
}

/**
 * Resume a paused recurring job — makes it active again.
 */
export async function resumeRecurringJob(id: string, resumedByRole?: 'client' | 'tradie'): Promise<void> {
  const { data: job, error: fetchError } = await supabase
    .from('recurring_jobs')
    .select('id, client_id, tradie_id, trade_category, service_subtype, cancelled_at')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!job) throw new Error('Service not found');

  // Only paused jobs can be resumed — cancelled jobs cannot
  if (job.cancelled_at) throw new Error('This service has been cancelled and cannot be resumed');

  const { error } = await supabase
    .from('recurring_jobs')
    .update({ is_active: true })
    .eq('id', id);

  if (error) throw new Error(error.message);

  // Re-activate linked service agreement if it was active before
  if (job?.client_id && job?.tradie_id) {
    try {
      await supabase
        .from('service_agreements')
        .update({ status: 'active', ended_at: null })
        .eq('client_id', job.client_id)
        .eq('tradie_id', job.tradie_id)
        .eq('trade_category', job.trade_category)
        .eq('status', 'ended');
    } catch {
      // Non-critical
    }
  }

  // Notify the other party
  if (job) {
    const tradeLabel = (job.service_subtype || job.trade_category || 'service')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    try {
      if (resumedByRole === 'client' && job.tradie_id) {
        await insertNotification(
          job.tradie_id,
          'recurring_resumed',
          `Your client has resumed the ${tradeLabel} service.`,
          { recurring_job_id: id },
        );
      } else if (resumedByRole === 'tradie' && job.client_id) {
        await insertNotification(
          job.client_id,
          'recurring_resumed',
          `Your tradie has resumed the ${tradeLabel} service.`,
          { recurring_job_id: id },
        );
      }
    } catch {
      // Non-critical
    }
  }
}

export type CancellationCategory =
  | 'price'
  | 'not_needed'
  | 'quality'
  | 'changed_tradie'
  | 'frequency'
  | 'other';

export interface CancelRecurringJobOptions {
  category?: CancellationCategory;
  reason?: string;
}

const CANCELLATION_CATEGORY_LABELS: Record<CancellationCategory, string> = {
  price: 'Too expensive',
  not_needed: "Don't need it anymore",
  quality: 'Quality issue',
  changed_tradie: 'Changed tradies',
  frequency: 'Wrong frequency',
  other: 'Other',
};

/**
 * Cancel (deactivate) a recurring job permanently — cancels sessions and ends agreements.
 */
export async function cancelRecurringJob(
  id: string,
  cancelledByRole?: 'client' | 'tradie',
  options?: CancelRecurringJobOptions,
): Promise<void> {
  // Fetch job details before cancelling (for notifications)
  const { data: job, error: fetchError } = await supabase
    .from('recurring_jobs')
    .select('id, client_id, tradie_id, trade_category, service_subtype, original_job_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const hadTradie = !!job?.tradie_id;

  if (!hadTradie) {
    // ── No tradie assigned: delete all data completely ──

    // Delete all sessions for this recurring job
    try {
      await supabase
        .from('recurring_sessions')
        .delete()
        .eq('recurring_job_id', id);
    } catch { /* Non-critical */ }

    // Delete service agreements for this client + trade (no tradie)
    if (job?.client_id) {
      try {
        await supabase
          .from('service_agreements')
          .delete()
          .eq('client_id', job.client_id)
          .eq('trade_category', job.trade_category)
          .is('tradie_id', null);
      } catch { /* Non-critical */ }

      // Also clean up agreements where tradie_id equals client_id (self-assigned fallback)
      try {
        await supabase
          .from('service_agreements')
          .delete()
          .eq('client_id', job.client_id)
          .eq('tradie_id', job.client_id)
          .eq('trade_category', job.trade_category);
      } catch { /* Non-critical */ }
    }

    // Delete the original job record from the jobs table
    if (job?.original_job_id) {
      try {
        await supabase
          .from('jobs')
          .delete()
          .eq('id', job.original_job_id)
          .in('status', ['pending', 'open']);
      } catch { /* Non-critical */ }
    }

    // Delete any other pending jobs linked to this client + category
    if (job?.client_id) {
      try {
        await supabase
          .from('notifications')
          .delete()
          .eq('user_id', job.client_id)
          .eq('job_id', job.original_job_id || '');
      } catch { /* Non-critical */ }
    }

    // Delete the recurring job itself
    const { error } = await supabase
      .from('recurring_jobs')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  } else {
    // ── Tradie was assigned: keep records as history ──

    // Deactivate and mark as cancelled. Reason fields are optional — we never
    // gate a cancellation on them, but persist whatever was supplied so the
    // other party gets context and we can analyse churn later.
    const trimmedReason = options?.reason?.trim() || null;
    const cancelUpdate: Record<string, unknown> = {
      is_active: false,
      cancelled_at: new Date().toISOString(),
    };
    if (options?.category) cancelUpdate.cancellation_reason_category = options.category;
    if (trimmedReason) cancelUpdate.cancellation_reason = trimmedReason;

    const { error } = await supabase
      .from('recurring_jobs')
      .update(cancelUpdate)
      .eq('id', id);

    if (error) throw new Error(error.message);

    // Cancel any pending/scheduled sessions (keep completed ones)
    try {
      await supabase
        .from('recurring_sessions')
        .update({ status: 'skipped', reschedule_reason: 'Service cancelled', confirmation_deadline: null })
        .eq('recurring_job_id', id)
        .in('status', ['pending_confirmation', 'scheduled']);
    } catch { /* Non-critical */ }

    // Cancel only the specific job linked to this recurring service (not other one-off jobs)
    if (job?.original_job_id) {
      try {
        await supabase
          .from('jobs')
          .update({ status: 'cancelled' })
          .eq('id', job.original_job_id)
          .in('status', ['pending', 'open', 'accepted', 'funded', 'in_progress']);
      } catch { /* Non-critical */ }
    }

    // End linked service agreements
    try {
      await supabase
        .from('service_agreements')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('client_id', job.client_id)
        .eq('tradie_id', job.tradie_id)
        .eq('trade_category', job.trade_category)
        .eq('status', 'active');
    } catch { /* Non-critical */ }

    // Notify the other party
    const tradeLabel = (job.service_subtype || job.trade_category || 'service')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Build a short suffix describing why — category label + (optional)
    // reason text. Keep it under ~120 chars so it fits comfortably in the
    // notification bell preview.
    const categoryLabel = options?.category ? CANCELLATION_CATEGORY_LABELS[options.category] : null;
    const reasonParts = [categoryLabel, trimmedReason].filter(Boolean) as string[];
    const reasonSuffix = reasonParts.length
      ? ` Reason: ${reasonParts.join(' — ').slice(0, 120)}`
      : '';

    try {
      if (cancelledByRole === 'client' && job.tradie_id) {
        await insertNotification(
          job.tradie_id,
          'recurring_cancelled',
          `Your client has cancelled the recurring ${tradeLabel} service.${reasonSuffix}`,
          { recurring_job_id: id },
        );
      } else if (job.client_id) {
        await insertNotification(
          job.client_id,
          'recurring_cancelled',
          `Your tradie has cancelled the recurring ${tradeLabel} service.${reasonSuffix}`,
          { recurring_job_id: id },
        );
      }
    } catch { /* Non-critical */ }
  }
}

/**
 * Mark a recurring job as completed for the current cycle.
 * Increments times_completed and advances the next_due_date.
 */
export async function markRecurringJobCompleted(id: string): Promise<void> {
  const { data: job, error: fetchError } = await supabase
    .from('recurring_jobs')
    .select('times_completed, frequency_months, next_due_date')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!job) throw new Error('Recurring job not found');

  const nextDue = calculateNextDueDate(new Date(), job.frequency_months);

  const { error } = await supabase
    .from('recurring_jobs')
    .update({
      times_completed: (job.times_completed ?? 0) + 1,
      next_due_date: nextDue.toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Get recurring jobs that are due soon (within their reminder window).
 */
export async function getDueReminders(userId?: string): Promise<DueReminder[]> {
  let uid = userId;

  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }

  const { data, error } = await supabase
    .from('recurring_jobs')
    .select(`
      id,
      trade_category,
      description,
      next_due_date,
      reminder_days_before,
      tradie_id,
      tradie:profiles!recurring_jobs_tradie_id_fkey(full_name)
    `)
    .eq('client_id', uid)
    .eq('is_active', true)
    .is('cancelled_at', null);

  if (error) throw new Error(error.message);
  if (!data) return [];

  const now = new Date();
  const reminders: DueReminder[] = [];

  interface DueReminderRow {
    id: string;
    trade_category: string;
    description: string;
    next_due_date: string;
    reminder_days_before: number;
    tradie_id: string;
    tradie: { full_name: string } | null;
  }

  for (const job of data as unknown as DueReminderRow[]) {
    const dueDate = new Date(job.next_due_date);
    const diffMs = dueDate.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntilDue >= 0 && daysUntilDue <= job.reminder_days_before) {
      reminders.push({
        id: job.id,
        trade_category: job.trade_category,
        description: job.description,
        next_due_date: job.next_due_date,
        reminder_days_before: job.reminder_days_before,
        tradie_name: job.tradie?.full_name ?? 'Unknown',
        tradie_id: job.tradie_id,
        days_until_due: daysUntilDue,
      });
    }
  }

  return reminders.sort((a, b) => a.days_until_due - b.days_until_due);
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * Suggest recurring job settings based on the trade category.
 */
export function suggestRecurringJob(tradeCategory: string): RecurringJobSuggestion {
  const key = tradeCategory.toLowerCase().replace(/\s+/g, '_');
  const frequencyMonths = DEFAULT_FREQUENCIES[key] ?? 12;

  const labels: Record<string, string> = {
    // Weekly
    cleaning_weekly: 'Weekly house cleaning',
    regular_house_clean: 'Weekly house cleaning',
    lawn_mowing_weekly: 'Weekly lawn mowing',
    regular_mowing: 'Weekly lawn mowing',
    pool_maintenance_weekly: 'Weekly pool service',
    chemical_balancing: 'Weekly pool chemical balance',
    // Fortnightly
    cleaning_fortnightly: 'Fortnightly house cleaning',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing',
    garden_maintenance_fortnightly: 'Fortnightly garden care',
    hedge_trimming: 'Fortnightly hedge trimming',
    mulching_and_weeding: 'Fortnightly mulching & weeding',
    garden_tidy_up: 'Fortnightly garden tidy-up',
    // Monthly
    cleaning: 'Monthly cleaning service',
    office_clean: 'Monthly office clean',
    commercial_clean: 'Monthly commercial clean',
    strata_common_areas: 'Monthly strata common area clean',
    lawn_mowing: 'Monthly lawn mowing',
    property_maintenance: 'Monthly property maintenance',
    filter_and_pump_service: 'Monthly pool filter & pump service',
    filter_replacement: 'Monthly HVAC filter replacement',
    filter_clean_and_gas_top_up: 'Monthly aircon filter clean & gas top-up',
    // Quarterly
    regular_aircon_service: 'Quarterly aircon service',
    regular_hvac_service: 'Quarterly HVAC service',
    landscaping: 'Quarterly garden maintenance',
    pool_maintenance: 'Quarterly pool service',
    garden_maintenance: 'Quarterly garden care',
    oven_and_bbq_clean: 'Quarterly oven & BBQ clean',
    regular_tree_maintenance: 'Quarterly tree maintenance',
    // Biannual
    gutter_cleaning: 'Biannual gutter clean',
    window_cleaning: 'Biannual window clean',
    carpet_cleaning: 'Biannual carpet steam clean',
    roof_inspection: 'Biannual roof inspection',
    dryer_vent_clean: 'Biannual dryer vent clean',
    floor_polishing_and_reseal: 'Biannual floor polishing & reseal',
    // Annual
    plumbing: 'Annual plumbing inspection',
    backflow_testing: 'Annual backflow testing',
    septic_pump_out: 'Annual septic pump-out',
    pest_control: 'Annual pest treatment',
    general_pest_treatment: 'Annual general pest treatment',
    hvac: 'Annual HVAC service',
    air_conditioning: 'Annual aircon service',
    solar: 'Annual solar panel inspection',
    panel_cleaning_and_inspection: 'Annual solar panel cleaning & inspection',
    fire_safety: 'Annual fire safety check',
    smoke_alarm_testing: 'Annual smoke alarm testing',
    fire_extinguisher_service: 'Annual fire extinguisher service',
    exit_light_inspection: 'Annual exit light inspection',
    hot_water_service: 'Annual hot water service',
    system_flush: 'Annual hot water system flush',
    anode_rod_check: 'Annual anode rod check',
    septic_tank: 'Annual septic pump-out',
    chimney_sweep: 'Annual chimney sweep',
    chimney_clean: 'Annual chimney clean',
    garage_doors: 'Annual garage door service',
    annual_service: 'Annual garage door service',
    security_systems: 'Annual security system check',
    annual_alarm_testing: 'Annual alarm system testing',
    appliance_service: 'Annual appliance service',
    safety_inspection: 'Annual electrical safety inspection',
    rcd_testing: 'Annual RCD testing',
    concrete_sealing: 'Annual concrete sealing',
    fence_staining: 'Annual fence staining',
    grout_and_reseal: 'Annual grout & reseal',
    membrane_inspection: 'Annual membrane inspection',
    // Biennial
    electrical: 'Biennial electrical safety check',
    roofing: 'Biennial roof inspection',
    waterproofing: 'Biennial waterproofing check',
    tree_lopping: 'Biennial tree lopping',
    termite_inspection: 'Biennial termite inspection',
    termite_barrier: 'Biennial termite barrier treatment',
    timber_maintenance: 'Biennial timber maintenance',
    touch_up_service: 'Biennial paint touch-up service',
    // 3-year
    carpentry: 'Timber maintenance (every 3 years)',
    fencing: 'Fence inspection (every 3 years)',
    concreting: 'Concrete sealing (every 3 years)',
    tiling: 'Tile & grout reseal (every 3 years)',
    // 5-year
    painting: 'Repaint (every 5 years)',
    rendering: 'Render refresh (every 5 years)',
  };

  const descriptions: Record<string, string> = {
    cleaning_weekly: 'Weekly home clean: kitchen, bathrooms, vacuuming, mopping, and dusting.',
    regular_house_clean: 'Weekly home clean: kitchen, bathrooms, vacuuming, mopping, and dusting.',
    lawn_mowing_weekly: 'Weekly lawn mowing, edging, and blowing.',
    regular_mowing: 'Weekly lawn mowing, edging, and blowing.',
    pool_maintenance_weekly: 'Weekly pool chemical balance, skim, brush, and filter basket clean.',
    chemical_balancing: 'Weekly pool chemical balance, water testing, and skim.',
    cleaning_fortnightly: 'Fortnightly deep clean: kitchens, bathrooms, floors, and surfaces.',
    lawn_mowing_fortnightly: 'Fortnightly lawn mowing, edging, and garden tidy.',
    garden_maintenance_fortnightly: 'Fortnightly weeding, pruning, and garden bed maintenance.',
    hedge_trimming: 'Fortnightly hedge trimming and shaping to keep your garden neat.',
    mulching_and_weeding: 'Fortnightly weeding, mulching, and garden bed maintenance.',
    garden_tidy_up: 'Fortnightly garden tidy: raking, pruning, blowing, and green waste removal.',
    cleaning: 'Thorough home cleaning including kitchens, bathrooms, and living areas.',
    office_clean: 'Monthly office clean: desks, floors, kitchenette, and bathrooms.',
    commercial_clean: 'Monthly commercial premises clean: floors, surfaces, and amenities.',
    strata_common_areas: 'Monthly strata common area clean: lobbies, stairwells, and car parks.',
    lawn_mowing: 'Regular lawn mowing, edging, and blowing to keep your yard neat.',
    property_maintenance: 'Monthly general property maintenance: repairs, checks, and upkeep.',
    filter_and_pump_service: 'Monthly pool filter clean, pump check, and pressure test.',
    filter_replacement: 'Monthly HVAC filter replacement and basic system check.',
    filter_clean_and_gas_top_up: 'Monthly aircon filter clean and gas level check.',
    regular_aircon_service: 'Quarterly aircon service: filter clean, gas top-up, and performance check.',
    regular_hvac_service: 'Quarterly HVAC service: filter change, duct inspection, and performance check.',
    landscaping: 'Seasonal garden maintenance including pruning, mulching, and planting.',
    pool_maintenance: 'Pool chemical balance, filter clean, pump check, and water testing.',
    garden_maintenance: 'Garden bed weeding, pruning, mulching, and seasonal planting.',
    oven_and_bbq_clean: 'Professional oven and BBQ deep clean and degrease.',
    regular_tree_maintenance: 'Quarterly tree pruning, dead branch removal, and canopy thinning.',
    gutter_cleaning: 'Clear gutters and downpipes of leaves and debris to prevent water damage.',
    window_cleaning: 'Interior and exterior window cleaning for all accessible windows.',
    carpet_cleaning: 'Professional carpet steam cleaning to remove dirt, stains, and allergens.',
    roof_inspection: 'Biannual roof check for leaks, loose tiles, and gutter condition.',
    dryer_vent_clean: 'Dryer vent and duct clean to prevent lint build-up and fire risk.',
    floor_polishing_and_reseal: 'Timber or polished concrete floor buff, polish, and reseal.',
    plumbing: 'Plumbing inspection: check pipes, taps, toilet mechanisms, and hot water system.',
    backflow_testing: 'Annual backflow prevention device testing as required by council.',
    septic_pump_out: 'Septic tank pump-out and system inspection.',
    pest_control: 'Comprehensive pest treatment for spiders, ants, cockroaches, and termites.',
    general_pest_treatment: 'General pest spray: spiders, ants, cockroaches, and silverfish.',
    hvac: 'Air conditioning and heating system service and filter replacement.',
    air_conditioning: 'Split system or ducted aircon service, gas top-up, and filter clean.',
    solar: 'Solar panel cleaning, inverter check, and performance inspection.',
    panel_cleaning_and_inspection: 'Solar panel wash, inverter check, and output performance report.',
    fire_safety: 'Smoke alarm testing, fire extinguisher check, and exit light inspection.',
    smoke_alarm_testing: 'Test and replace batteries in all smoke alarms to meet AS 3786.',
    fire_extinguisher_service: 'Fire extinguisher pressure test, tag, and replace if expired.',
    exit_light_inspection: 'Emergency and exit light function test and battery check.',
    hot_water_service: 'Hot water system flush, anode rod check, and temperature/pressure relief valve test.',
    system_flush: 'Hot water system flush to remove sediment and maintain efficiency.',
    anode_rod_check: 'Anode rod inspection and replacement to extend tank life.',
    septic_tank: 'Septic tank pump-out and system inspection.',
    chimney_sweep: 'Chimney and flue cleaning to prevent fire hazards and improve airflow.',
    chimney_clean: 'Full chimney sweep: creosote removal, flue inspection, and cowl check.',
    garage_doors: 'Garage door service: spring tension, track alignment, and motor check.',
    annual_service: 'Annual garage door service: lubrication, spring tension, and safety sensor check.',
    security_systems: 'Security alarm testing, camera check, and sensor calibration.',
    annual_alarm_testing: 'Annual security alarm and sensor test with monitoring station check-in.',
    appliance_service: 'Service and clean major appliances (oven, dishwasher, dryer).',
    safety_inspection: 'Electrical safety inspection: switchboard, wiring, and compliance check.',
    rcd_testing: 'Residual current device testing to ensure electrical safety compliance.',
    concrete_sealing: 'Concrete driveway and path sealing to prevent cracking and staining.',
    fence_staining: 'Timber fence stain and seal to protect from weather and UV damage.',
    grout_and_reseal: 'Re-grout and reseal bathroom and kitchen tiles to prevent water damage.',
    membrane_inspection: 'Waterproof membrane inspection in wet areas and balconies.',
    electrical: 'Electrical safety inspection including switchboard, smoke alarms, and RCD testing.',
    roofing: 'Roof inspection for leaks, damaged tiles, ridge capping, and gutter condition.',
    waterproofing: 'Check waterproof membranes in wet areas, balconies, and below-grade walls.',
    tree_lopping: 'Tree pruning, dead limb removal, and canopy shaping.',
    termite_inspection: 'Full termite inspection with thermal imaging and moisture detection.',
    termite_barrier: 'Termite barrier re-treatment and perimeter inspection.',
    timber_maintenance: 'Deck and timber structure oiling, sanding, and repair.',
    touch_up_service: 'Interior/exterior paint touch-up: scuffs, chips, and wear areas.',
    carpentry: 'Inspection and maintenance of timber structures, decks, and fences.',
    fencing: 'Fence inspection: check posts, rails, and palings. Repair or stain as needed.',
    concreting: 'Concrete driveway and path sealing to prevent cracking and staining.',
    tiling: 'Re-grout and reseal bathroom and kitchen tiles to prevent water damage.',
    painting: 'Full interior/exterior repaint to maintain your property.',
    rendering: 'Inspect and patch render, apply fresh paint or sealant coat.',
  };

  // Typical Australian pricing ranges per service visit
  const pricing: Record<string, { min: number; max: number; unit: string }> = {
    cleaning_weekly: { min: 80, max: 180, unit: 'per visit' },
    regular_house_clean: { min: 80, max: 180, unit: 'per visit' },
    cleaning_fortnightly: { min: 100, max: 220, unit: 'per visit' },
    cleaning: { min: 120, max: 300, unit: 'per visit' },
    office_clean: { min: 150, max: 400, unit: 'per visit' },
    commercial_clean: { min: 200, max: 600, unit: 'per visit' },
    strata_common_areas: { min: 200, max: 500, unit: 'per visit' },
    oven_and_bbq_clean: { min: 100, max: 250, unit: 'per visit' },
    lawn_mowing_weekly: { min: 40, max: 80, unit: 'per visit' },
    regular_mowing: { min: 40, max: 80, unit: 'per visit' },
    lawn_mowing_fortnightly: { min: 50, max: 100, unit: 'per visit' },
    lawn_mowing: { min: 50, max: 120, unit: 'per visit' },
    hedge_trimming: { min: 60, max: 150, unit: 'per visit' },
    garden_tidy_up: { min: 60, max: 150, unit: 'per visit' },
    pool_maintenance_weekly: { min: 60, max: 120, unit: 'per visit' },
    chemical_balancing: { min: 60, max: 120, unit: 'per visit' },
    filter_and_pump_service: { min: 80, max: 180, unit: 'per visit' },
    pool_maintenance: { min: 150, max: 350, unit: 'per visit' },
    garden_maintenance_fortnightly: { min: 80, max: 160, unit: 'per visit' },
    garden_maintenance: { min: 150, max: 400, unit: 'per visit' },
    regular_tree_maintenance: { min: 200, max: 500, unit: 'per visit' },
    landscaping: { min: 200, max: 600, unit: 'per visit' },
    property_maintenance: { min: 100, max: 300, unit: 'per visit' },
    gutter_cleaning: { min: 150, max: 350, unit: 'per visit' },
    window_cleaning: { min: 150, max: 400, unit: 'per visit' },
    carpet_cleaning: { min: 120, max: 350, unit: 'per visit' },
    roof_inspection: { min: 150, max: 350, unit: 'per visit' },
    dryer_vent_clean: { min: 80, max: 180, unit: 'per visit' },
    floor_polishing_and_reseal: { min: 300, max: 800, unit: 'per visit' },
    plumbing: { min: 150, max: 350, unit: 'per visit' },
    backflow_testing: { min: 100, max: 200, unit: 'per visit' },
    septic_pump_out: { min: 300, max: 600, unit: 'per visit' },
    pest_control: { min: 150, max: 400, unit: 'per visit' },
    general_pest_treatment: { min: 150, max: 350, unit: 'per visit' },
    termite_barrier: { min: 1500, max: 4000, unit: 'per treatment' },
    hvac: { min: 120, max: 300, unit: 'per visit' },
    regular_hvac_service: { min: 120, max: 300, unit: 'per visit' },
    filter_replacement: { min: 50, max: 120, unit: 'per visit' },
    air_conditioning: { min: 100, max: 250, unit: 'per visit' },
    regular_aircon_service: { min: 100, max: 250, unit: 'per visit' },
    filter_clean_and_gas_top_up: { min: 80, max: 180, unit: 'per visit' },
    electrical: { min: 200, max: 450, unit: 'per visit' },
    safety_inspection: { min: 200, max: 450, unit: 'per visit' },
    rcd_testing: { min: 100, max: 200, unit: 'per visit' },
    smoke_alarm_testing: { min: 80, max: 150, unit: 'per visit' },
    fire_extinguisher_service: { min: 50, max: 120, unit: 'per unit' },
    exit_light_inspection: { min: 80, max: 200, unit: 'per visit' },
    roofing: { min: 200, max: 500, unit: 'per visit' },
    painting: { min: 2000, max: 8000, unit: 'per job' },
    touch_up_service: { min: 200, max: 600, unit: 'per visit' },
    solar: { min: 150, max: 350, unit: 'per visit' },
    panel_cleaning_and_inspection: { min: 150, max: 350, unit: 'per visit' },
    tree_lopping: { min: 300, max: 1500, unit: 'per visit' },
    termite_inspection: { min: 200, max: 400, unit: 'per visit' },
    fencing: { min: 100, max: 300, unit: 'per visit' },
    fence_staining: { min: 200, max: 500, unit: 'per visit' },
    concreting: { min: 200, max: 500, unit: 'per visit' },
    concrete_sealing: { min: 200, max: 500, unit: 'per visit' },
    tiling: { min: 200, max: 500, unit: 'per visit' },
    grout_and_reseal: { min: 200, max: 500, unit: 'per visit' },
    hot_water_service: { min: 150, max: 300, unit: 'per visit' },
    system_flush: { min: 100, max: 200, unit: 'per visit' },
    anode_rod_check: { min: 100, max: 250, unit: 'per visit' },
    chimney_sweep: { min: 150, max: 300, unit: 'per visit' },
    chimney_clean: { min: 150, max: 300, unit: 'per visit' },
    garage_doors: { min: 100, max: 250, unit: 'per visit' },
    annual_service: { min: 100, max: 250, unit: 'per visit' },
    security_systems: { min: 100, max: 250, unit: 'per visit' },
    annual_alarm_testing: { min: 100, max: 250, unit: 'per visit' },
    appliance_service: { min: 120, max: 300, unit: 'per visit' },
    waterproofing: { min: 200, max: 500, unit: 'per visit' },
    membrane_inspection: { min: 150, max: 350, unit: 'per visit' },
    timber_maintenance: { min: 200, max: 600, unit: 'per visit' },
    carpentry: { min: 200, max: 600, unit: 'per visit' },
  };

  return {
    tradeCategory,
    frequencyMonths,
    label: labels[key] ?? `Regular ${tradeCategory} service`,
    description: descriptions[key] ?? `Recurring ${tradeCategory} maintenance service.`,
    priceRange: pricing[key],
  };
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Fetch upcoming sessions for a recurring job (next 3 months).
 */
export async function getUpcomingSessions(
  recurringJobId: string,
): Promise<RecurringSession[]> {
  const now = new Date();
  // Include recent past sessions (7 days) so completed visits are visible
  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - 7);
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select('*')
    .eq('recurring_job_id', recurringJobId)
    .gte('scheduled_date', lookback.toISOString().split('T')[0])
    .lte('scheduled_date', threeMonthsLater.toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RecurringSession[];
}

/**
 * Reschedule a session to a new date.
 */
export async function rescheduleSession(
  sessionId: string,
  newDate: string,
  reason: string,
  by: 'client' | 'tradie',
): Promise<void> {
  // Fetch session + job to find the other party
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      actual_date: newDate,
      status: 'rescheduled',
      reschedule_reason: reason,
      reschedule_by: by,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Unblock the original time slot so tradie is available again
  try {
    const { unblockTimeSlot } = await import('./availability');
    await unblockTimeSlot(sessionId);
  } catch {
    // Non-critical
  }

  // Notify the other party
  if (session?.recurring_job) {
    const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string };
    const recipientId = by === 'client' ? job.tradie_id : job.client_id;
    if (recipientId) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      const byLabel = by === 'client' ? 'homeowner' : 'tradie';
      try {
        await insertNotification(
          recipientId,
          'session_rescheduled',
          `Your ${tradeLabel} session has been rescheduled to ${dateLabel} by the ${byLabel}. Reason: ${reason}`,
          { session_id: sessionId, recurring_job_id: session.recurring_job_id, new_date: newDate },
        );
      } catch {
        // Non-critical — session was rescheduled, notification is best-effort
      }
    }
  }
}

/**
 * Skip a session with a reason.
 */
export async function skipSession(
  sessionId: string,
  reason: string,
  by: 'client' | 'tradie',
): Promise<void> {
  // Fetch session + job to find the other party
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      status: 'skipped',
      reschedule_reason: reason,
      reschedule_by: by,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Unblock the time slot so tradie is available again
  try {
    const { unblockTimeSlot } = await import('./availability');
    await unblockTimeSlot(sessionId);
  } catch {
    // Non-critical
  }

  // Notify both parties
  if (session?.recurring_job) {
    const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string };
    const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const dateLabel = session.scheduled_date
      ? new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
      : 'upcoming';
    const metadata = { session_id: sessionId, recurring_job_id: session.recurring_job_id, scheduled_date: session.scheduled_date };

    try {
      // Notify the other party
      const recipientId = by === 'client' ? job.tradie_id : job.client_id;
      if (recipientId) {
        const byLabel = by === 'client' ? 'homeowner' : 'tradie';
        await insertNotification(
          recipientId,
          'session_skipped',
          `Your ${tradeLabel} session on ${dateLabel} has been skipped by the ${byLabel}. Reason: ${reason}`,
          metadata,
        );
      }

      // Confirm to the skipping party
      const selfId = by === 'client' ? job.client_id : job.tradie_id;
      if (selfId) {
        await insertNotification(
          selfId,
          'session_skipped_confirmed',
          `You skipped the ${tradeLabel} session on ${dateLabel}. Reason: ${reason}`,
          metadata,
        );
      }
    } catch {
      // Non-critical
    }
  }
}

/**
 * Add an extra session (outside normal schedule).
 */
export async function addExtraSession(
  recurringJobId: string,
  date: string,
  extraHours: number,
  extraCost: number,
  notes: string,
  tradieId?: string,
): Promise<RecurringSession> {
  const { data, error } = await supabase
    .from('recurring_sessions')
    .insert({
      recurring_job_id: recurringJobId,
      scheduled_date: date,
      status: 'extra',
      extra_hours: extraHours,
      extra_cost: extraCost,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Block the time slot in tradie_availability if tradieId provided
  if (tradieId) {
    try {
      const { blockTimeSlot } = await import('./availability');
      await blockTimeSlot(tradieId, date, '07:00:00', '17:00:00', `Extra session: ${notes || 'Additional work'}`, data.id);
    } catch {
      // Non-critical — session was created, availability block is best-effort
    }
  }

  // Notify the homeowner about the extra session
  try {
    const { data: job } = await supabase
      .from('recurring_jobs')
      .select('client_id, trade_category')
      .eq('id', recurringJobId)
      .maybeSingle();

    if (job?.client_id) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      const costLabel = extraCost > 0 ? ` ($${extraCost.toFixed(2)})` : '';
      await insertNotification(
        job.client_id,
        'extra_session_added',
        `An extra ${tradeLabel} session${costLabel} has been added for ${dateLabel}.${notes ? ` Notes: ${notes}` : ''}`,
        { session_id: data.id, recurring_job_id: recurringJobId, date, extra_cost: extraCost },
      );
    }
  } catch {
    // Non-critical
  }

  return data as RecurringSession;
}

/**
 * Cancel an extra session — sets status to 'skipped' and unblocks the time slot.
 */
export async function cancelExtraSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'skipped' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Unblock the time slot (source_job_id was set to session id)
  try {
    const { unblockTimeSlot } = await import('./availability');
    await unblockTimeSlot(sessionId);
  } catch {
    // Non-critical
  }
}

/**
 * Mark a session as completed.
 * Also updates the parent recurring_job (last_completed_at, times_completed),
 * generates the next session immediately (so we don't wait for the daily cron),
 * and notifies both client and tradie about the next upcoming session.
 */
export async function completeSession(sessionId: string): Promise<void> {
  // 1. Fetch session + parent recurring job details
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('id, recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(id, client_id, tradie_id, trade_category, service_subtype, frequency_months, next_due_date, is_active, cancelled_at, times_completed, preferred_time, agreed_price, auto_accept, end_date)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!session) throw new Error('Session not found');

  // 2. Check parent job is active before completing
  const job = session.recurring_job as {
    id: string;
    client_id: string;
    tradie_id: string | null;
    trade_category: string;
    service_subtype: string | null;
    frequency_months: number;
    next_due_date: string | null;
    is_active: boolean;
    cancelled_at: string | null;
    times_completed: number;
    preferred_time: string | null;
    agreed_price: number | null;
    auto_accept: boolean;
    end_date: string | null;
  } | null;

  if (!job) throw new Error('Recurring job not found');
  if (!job.is_active || job.cancelled_at) throw new Error('This service is paused or cancelled');

  // 3. Mark session as completed
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('recurring_jobs')
    .update({
      last_completed_at: now,
      times_completed: (job.times_completed ?? 0) + 1,
    })
    .eq('id', job.id);

  if (updateError) {
    console.error('Failed to update recurring job after session completion:', updateError.message);
  }

  // 4. Generate the next session immediately (dedup: skip if already exists)
  // Skip if the job has an end_date and the next session would be past it
  const completedDate = session.scheduled_date;
  const nextDueDate = calculateNextDueDate(completedDate, job.frequency_months);
  const nextDateStr = nextDueDate.toISOString().split('T')[0];

  if (job.end_date && nextDateStr > job.end_date) {
    // Job has naturally ended — no more sessions to generate
    return;
  }

  try {
    const { data: existingSession } = await supabase
      .from('recurring_sessions')
      .select('id')
      .eq('recurring_job_id', job.id)
      .eq('scheduled_date', nextDateStr)
      .maybeSingle();

    if (!existingSession) {
      const isAutoAccept = !!job.auto_accept;
      const sessionStatus = isAutoAccept ? 'scheduled' : 'pending_confirmation';
      const confirmationDeadline = isAutoAccept ? null : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      await supabase
        .from('recurring_sessions')
        .insert({
          recurring_job_id: job.id,
          scheduled_date: nextDateStr,
          status: sessionStatus,
          confirmation_deadline: confirmationDeadline,
        });

      // Advance next_due_date on the recurring job so the cron doesn't duplicate
      const followingDate = calculateNextDueDate(nextDateStr, job.frequency_months);
      await supabase
        .from('recurring_jobs')
        .update({ next_due_date: followingDate.toISOString().split('T')[0] })
        .eq('id', job.id);

      // Block availability if auto-accepted
      if (isAutoAccept && job.tradie_id) {
        try {
          const startTime = job.preferred_time || '09:00:00';
          const [h, m] = startTime.split(':').map(Number);
          const totalMinutes = (h + 2) * 60 + m;
          const endH = Math.min(Math.floor(totalMinutes / 60), 23);
          const endM = totalMinutes % 60;
          const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

          await supabase
            .from('tradie_availability')
            .upsert(
              {
                tradie_id: job.tradie_id,
                date: nextDateStr,
                start_time: startTime,
                end_time: endTime,
                is_blocked: true,
                reason: 'recurring_job',
              },
              { onConflict: 'tradie_id,date,start_time' },
            );
        } catch {
          // Non-critical
        }
      }
      // Note: if not auto-accepted, availability blocking happens when the tradie confirms (confirmSession)

      // Pre-generate future sessions when auto-accept is on
      if (isAutoAccept) {
        try {
          await generateFutureSessions(job.id);
        } catch {
          // Non-critical
        }
      }
    }
  } catch {
    // Non-critical — the daily cron will pick it up if immediate generation fails
    console.error('Failed to immediately generate next recurring session');
  }

  // 5. Send notifications
  const tradeLabel = (job.service_subtype || job.trade_category)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const nextDateLabel = new Date(nextDateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const priceStr = job.agreed_price ? ` — $${job.agreed_price.toFixed(2)}` : '';

  // Check auto_accept flag for notification message
  const isAutoAccept = !!job.auto_accept;

  try {
    // Notify client
    await insertNotification(
      job.client_id,
      'session_completed',
      isAutoAccept
        ? `Your ${tradeLabel} session is complete. Next session auto-confirmed for ${nextDateLabel}${priceStr}.`
        : `Your ${tradeLabel} session has been completed. Next session (${nextDateLabel}${priceStr}) is awaiting tradie confirmation.`,
      { recurring_job_id: job.id, next_date: nextDateStr },
    );

    // Notify tradie
    if (job.tradie_id) {
      await insertNotification(
        job.tradie_id,
        isAutoAccept ? 'recurring_job_auto_confirmed' : 'recurring_job_confirmation_required',
        isAutoAccept
          ? `${tradeLabel} complete. Next session auto-confirmed for ${nextDateLabel}${priceStr} and added to your schedule.`
          : `${tradeLabel} session complete. Confirm your next session on ${nextDateLabel}${priceStr} within 48 hours.`,
        { recurring_job_id: job.id, next_date: nextDateStr },
      );
    }
  } catch {
    // Non-critical — notifications are best-effort
  }
}

/**
 * Tradie confirms a pending_confirmation session → becomes scheduled.
 */
export async function confirmSession(sessionId: string): Promise<void> {
  // Fetch session + job for notifications
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('id, recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category, service_subtype, preferred_time, agreed_price, original_job_id)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!session) throw new Error('Session not found');

  // Only confirm if still pending — prevents race condition with double confirmation
  const { data: updated, error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'scheduled', confirmation_deadline: null })
    .eq('id', sessionId)
    .eq('status', 'pending_confirmation')
    .select('id');

  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error('Session has already been confirmed or is no longer pending');

  // Block tradie availability now that session is confirmed
  const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string; service_subtype: string | null; preferred_time: string | null; agreed_price: number | null; original_job_id: string | null } | null;

  // If the recurring job has no tradie assigned yet, assign the confirming tradie
  if (job && !job.tradie_id) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('recurring_jobs')
        .update({ tradie_id: user.id })
        .eq('id', session.recurring_job_id);
      job.tradie_id = user.id;

      // Also update the linked job record so client sees "Tradie Assigned"
      if (job.original_job_id) {
        try {
          await supabase
            .from('jobs')
            .update({ tradie_id: user.id, quoting_status: 'awarded', status: 'accepted' })
            .eq('id', job.original_job_id);
        } catch { /* Non-critical */ }
      }
    }
  }

  // Update linked job status to accepted when tradie confirms the session
  if (job?.original_job_id && job.tradie_id) {
    try {
      await supabase
        .from('jobs')
        .update({ status: 'accepted' })
        .eq('id', job.original_job_id)
        .eq('status', 'pending');
    } catch { /* Non-critical */ }
  }

  if (job?.tradie_id) {
    try {
      const startTime = job.preferred_time || '09:00:00';
      const [h, m] = startTime.split(':').map(Number);
      const totalMinutes = (h + 2) * 60 + m;
      const endH = Math.min(Math.floor(totalMinutes / 60), 23);
      const endM = totalMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

      await supabase
        .from('tradie_availability')
        .upsert(
          {
            tradie_id: job.tradie_id,
            date: session.scheduled_date,
            start_time: startTime,
            end_time: endTime,
            is_blocked: true,
            reason: 'recurring_job',
          },
          { onConflict: 'tradie_id,date,start_time' },
        );
    } catch {
      // Non-critical
    }
  }

  // Notify client that tradie confirmed
  if (job) {
    const tradeLabel = (job.service_subtype || job.trade_category)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const dateLabel = new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    const priceStr = job.agreed_price ? ` at $${job.agreed_price.toFixed(2)}` : '';

    try {
      await insertNotification(
        job.client_id,
        'recurring_job_confirmed',
        `Your tradie confirmed the next ${tradeLabel} session for ${dateLabel}${priceStr}.`,
        { recurring_job_id: session.recurring_job_id, session_date: session.scheduled_date },
      );
    } catch {
      // Non-critical
    }
  }
}

/**
 * Tradie declines a pending_confirmation session → session removed,
 * recurring job paused, client notified.
 */
export async function declineSession(sessionId: string, reason?: string): Promise<void> {
  // Fetch session + job for notifications
  const { data: session, error: fetchError } = await supabase
    .from('recurring_sessions')
    .select('id, recurring_job_id, scheduled_date, recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(client_id, tradie_id, trade_category, service_subtype)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!session) throw new Error('Session not found');

  // Mark session as skipped with decline reason
  const { error } = await supabase
    .from('recurring_sessions')
    .update({
      status: 'skipped',
      reschedule_reason: reason || 'Tradie declined',
      reschedule_by: 'tradie',
      confirmation_deadline: null,
    })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);

  // Notify client
  const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string; service_subtype: string | null } | null;

  if (job) {
    const tradeLabel = (job.service_subtype || job.trade_category)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const dateLabel = new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });

    try {
      await insertNotification(
        job.client_id,
        'recurring_job_declined',
        `Your tradie is unavailable for ${tradeLabel} on ${dateLabel}. ${reason ? `Reason: ${reason}` : 'Please review your recurring service.'}`,
        { recurring_job_id: session.recurring_job_id, session_date: session.scheduled_date },
      );
    } catch {
      // Non-critical
    }
  }
}

/**
 * Accept a reschedule proposal — sets actual_date as confirmed.
 */
export async function acceptReschedule(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'scheduled' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

/**
 * Fetch upcoming sessions assigned to a tradie (across all recurring jobs).
 */
export async function getTradieUpcomingSessions(
  tradieId: string,
  limit = 5,
): Promise<(RecurringSession & { recurring_job?: { trade_category: string; service_subtype: string | null; description: string; client_id: string; preferred_time: string | null; agreed_price: number | null; auto_accept: boolean | null; location: string | null; frequency_months: number; billing_cycle: string | null; last_invoiced_at: string | null; client: { full_name: string; phone?: string | null; email?: string | null } | null } })[]> {
  // Include recent past sessions (7 days) so overdue visits are visible
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 7);
  const lookbackDate = lookback.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select(`
      *,
      recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
        trade_category,
        service_subtype,
        description,
        client_id,
        preferred_time,
        agreed_price,
        auto_accept,
        location,
        frequency_months,
        billing_cycle,
        last_invoiced_at,
        supplies,
        is_active,
        cancelled_at,
        tradie_id,
        client:profiles!recurring_jobs_client_id_fkey(full_name, phone, email)
      )
    `)
    .in('status', ['pending_confirmation', 'scheduled', 'awaiting_completion'])
    .gte('scheduled_date', lookbackDate)
    .order('scheduled_date', { ascending: true })
    .limit(limit * 3); // fetch extra, filter client-side

  if (error) throw new Error(error.message);

  // Filter to only sessions where the recurring job's tradie matches
  const filtered = (data ?? []).filter((row: Record<string, unknown>) => {
    const job = row.recurring_job as { tradie_id?: string } | null;
    return job?.tradie_id === tradieId;
  });

  return filtered.slice(0, limit) as (RecurringSession & { recurring_job?: { trade_category: string; service_subtype: string | null; description: string; client_id: string; preferred_time: string | null; agreed_price: number | null; auto_accept: boolean | null; location: string | null; frequency_months: number; billing_cycle: string | null; last_invoiced_at: string | null; client: { full_name: string; phone?: string | null; email?: string | null } | null } })[];
}

// ---------------------------------------------------------------------------
// Auto-schedule: pre-generate future sessions for auto-accept jobs
// ---------------------------------------------------------------------------

/**
 * Generate future recurring sessions so the tradie's schedule is planned out.
 * For weekly/fortnightly: generates up to 8 future sessions.
 * For monthly+: generates up to 6 future sessions.
 * Skips dates that already have a session.
 */
export async function generateFutureSessions(
  recurringJobId: string,
): Promise<number> {
  const { data: job, error: jobErr } = await supabase
    .from('recurring_jobs')
    .select('id, frequency_months, next_due_date, is_active, cancelled_at, tradie_id, preferred_time, end_date')
    .eq('id', recurringJobId)
    .maybeSingle();

  if (jobErr || !job || !job.is_active || job.cancelled_at) return 0;

  // Decide how many sessions to generate
  const count = (job.frequency_months === FREQ_DAILY) ? 14
    : (job.frequency_months === FREQ_WEEKLY || job.frequency_months === FREQ_FORTNIGHTLY) ? 8
    : 6;

  // Get existing scheduled dates to avoid duplicates
  const { data: existing } = await supabase
    .from('recurring_sessions')
    .select('scheduled_date')
    .eq('recurring_job_id', recurringJobId)
    .in('status', ['scheduled', 'pending_confirmation']);

  const existingDates = new Set((existing ?? []).map(s => s.scheduled_date));

  // Start from the latest existing scheduled date or next_due_date
  const allDates = (existing ?? []).map(s => s.scheduled_date).sort();
  let cursor = allDates.length > 0
    ? allDates[allDates.length - 1]
    : (job.next_due_date || new Date().toISOString().split('T')[0]);

  let created = 0;
  const inserts: { recurring_job_id: string; scheduled_date: string; status: string; confirmation_deadline: null }[] = [];

  for (let i = 0; i < count; i++) {
    const nextDate = calculateNextDueDate(cursor, job.frequency_months);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // Stop generating if past the job's end date
    if (job.end_date && nextDateStr > job.end_date) break;

    if (!existingDates.has(nextDateStr)) {
      inserts.push({
        recurring_job_id: recurringJobId,
        scheduled_date: nextDateStr,
        status: 'scheduled',
        confirmation_deadline: null,
      });
      existingDates.add(nextDateStr);
      created++;
    }
    cursor = nextDateStr;
  }

  if (inserts.length > 0) {
    try {
      const { error: insertErr } = await supabase.from('recurring_sessions').insert(inserts);
      if (insertErr) {
        console.error('Failed to insert future recurring sessions:', insertErr.message);
        return 0;
      }

      // Advance next_due_date to beyond the last generated session
      const lastDate = inserts[inserts.length - 1].scheduled_date;
      const followingDate = calculateNextDueDate(lastDate, job.frequency_months);
      const { error: updateErr } = await supabase.from('recurring_jobs').update({
        next_due_date: followingDate.toISOString().split('T')[0],
      }).eq('id', recurringJobId);
      if (updateErr) {
        console.error('Failed to advance next_due_date after generating sessions:', updateErr.message);
      }
    } catch (err) {
      console.error('Failed to generate future sessions:', err);
      return 0;
    }
  }

  return created;
}

/**
 * Insert a notification for a user (e.g., reschedule proposal).
 */
export async function insertNotification(
  userId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
  title?: string,
): Promise<void> {
  // Route through the SECURITY DEFINER create_notification RPC. Direct
  // INSERT on the notifications table is being revoked from authenticated.
  const { error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_title: title || getDefaultTitle(type),
    p_message: message,
    p_type: type,
    p_channel: 'in_app',
    p_read: false,
    p_link: null,
    p_job_id: null,
    p_metadata: metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

function getDefaultTitle(type: string): string {
  switch (type) {
    case 'recurring_job_auto_confirmed': return 'Next Visit Confirmed';
    case 'recurring_job_confirmation_required': return 'Confirm Your Next Visit';
    case 'session_completed': return 'Visit Completed';
    case 'session_overdue': return 'Visit Overdue';
    case 'session_rescheduled': return 'Visit Rescheduled';
    case 'session_skipped': return 'Visit Skipped';
    case 'extra_session_added': return 'Extra Visit Added';
    case 'recurring_paused': return 'Service Paused';
    case 'recurring_cancelled': return 'Service Cancelled';
    case 'recurring_resumed': return 'Service Resumed';
    case 'supply_restock_needed': return 'Supply Restock Needed';
    default: return 'Service Update';
  }
}

// ---------------------------------------------------------------------------
// Invoice preview
// ---------------------------------------------------------------------------

export interface InvoicePreview {
  regularSessions: RecurringSession[];
  extraSessions: RecurringSession[];
  skippedSessions: RecurringSession[];
  subtotal: number;
  extrasTotal: number;
  total: number;
  billingCycle: string;
}

/**
 * Build an invoice preview for a billing period.
 */
export async function getInvoicePreview(
  recurringJobId: string,
  billingPeriodStart: string,
  billingPeriodEnd: string,
): Promise<InvoicePreview> {
  // Fetch the recurring job for agreed_price and billing_cycle
  const { data: job, error: jobError } = await supabase
    .from('recurring_jobs')
    .select('agreed_price, billing_cycle')
    .eq('id', recurringJobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);

  const agreedPrice = (job?.agreed_price as number) ?? 0;
  const billingCycle = (job?.billing_cycle as string) ?? 'monthly';

  // Fetch all sessions in the billing period
  const { data: sessions, error: sessionsError } = await supabase
    .from('recurring_sessions')
    .select('*')
    .eq('recurring_job_id', recurringJobId)
    .gte('scheduled_date', billingPeriodStart)
    .lte('scheduled_date', billingPeriodEnd)
    .order('scheduled_date', { ascending: true });

  if (sessionsError) throw new Error(sessionsError.message);

  const allSessions = (sessions ?? []) as RecurringSession[];

  const regularSessions = allSessions.filter((s) => s.status === 'completed');
  const extraSessions = allSessions.filter((s) => s.status === 'extra');
  const skippedSessions = allSessions.filter((s) => s.status === 'skipped');

  const subtotal = agreedPrice * regularSessions.length;
  const extrasTotal = extraSessions.reduce((sum, s) => sum + (s.extra_cost ?? 0), 0);

  return {
    regularSessions,
    extraSessions,
    skippedSessions,
    subtotal,
    extrasTotal,
    total: subtotal + extrasTotal,
    billingCycle,
  };
}
