import { supabase } from './supabase';

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
  tradie?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export type RecurringSessionStatus = 'scheduled' | 'completed' | 'rescheduled' | 'skipped' | 'extra';

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

// Frequency conventions: positive = months, -1 = weekly (7 days), -2 = fortnightly (14 days)
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
  if (frequencyMonths === FREQ_WEEKLY) {
    next.setDate(next.getDate() + 7);
  } else if (frequencyMonths === FREQ_FORTNIGHTLY) {
    next.setDate(next.getDate() + 14);
  } else if (frequencyMonths > 0) {
    next.setMonth(next.getMonth() + frequencyMonths);
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

  const insertPayload: Record<string, unknown> = {
    client_id: data.client_id ?? user.id,
    tradie_id: data.tradie_id || null,
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

  return created as unknown as RecurringJob;
}

// ---------------------------------------------------------------------------
// Keyword Suggestions
// ---------------------------------------------------------------------------

export interface KeywordSuggestion {
  keyword: string;
  frequency: number;
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
    .select('keyword, frequency')
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
 * Cancel (deactivate) a recurring job.
 */
export async function cancelRecurringJob(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_jobs')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
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
    .eq('is_active', true);

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
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const { data, error } = await supabase
    .from('recurring_sessions')
    .select('*')
    .eq('recurring_job_id', recurringJobId)
    .gte('scheduled_date', now.toISOString().split('T')[0])
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

  // Notify the other party
  if (session?.recurring_job) {
    const job = session.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string };
    const recipientId = by === 'client' ? job.tradie_id : job.client_id;
    if (recipientId) {
      const tradeLabel = job.trade_category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const dateLabel = session.scheduled_date
        ? new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
        : 'upcoming';
      const byLabel = by === 'client' ? 'homeowner' : 'tradie';
      try {
        await insertNotification(
          recipientId,
          'session_skipped',
          `Your ${tradeLabel} session on ${dateLabel} has been skipped by the ${byLabel}. Reason: ${reason}`,
          { session_id: sessionId, recurring_job_id: session.recurring_job_id, scheduled_date: session.scheduled_date },
        );
      } catch {
        // Non-critical
      }
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
 */
export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
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
): Promise<(RecurringSession & { recurring_job?: { trade_category: string; service_subtype: string | null; description: string; client_id: string; preferred_time: string | null } })[]> {
  const today = new Date().toISOString().split('T')[0];

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
        tradie_id
      )
    `)
    .eq('status', 'scheduled')
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .limit(limit * 3); // fetch extra, filter client-side

  if (error) throw new Error(error.message);

  // Filter to only sessions where the recurring job's tradie matches
  const filtered = (data ?? []).filter((row: Record<string, unknown>) => {
    const job = row.recurring_job as { tradie_id?: string } | null;
    return job?.tradie_id === tradieId;
  });

  return filtered.slice(0, limit) as (RecurringSession & { recurring_job?: { trade_category: string; description: string; client_id: string; preferred_time: string | null } })[];
}

/**
 * Insert a notification for a user (e.g., reschedule proposal).
 */
export async function insertNotification(
  userId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      message,
      metadata: metadata ?? {},
      read: false,
    });

  if (error) throw new Error(error.message);
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
