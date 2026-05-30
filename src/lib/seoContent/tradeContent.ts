// ─────────────────────────────────────────────────────────────────────────────
// Per-trade content for SEO landing pages.
//
// Each trade ships with:
//   • intro      — 2–3 sentence summary used as the page lede
//   • whatTheyDo — common services bullet list (FAQ schema-eligible)
//   • costGuide  — typical job price ranges (AUD, in dollars)
//   • licenseNote— state-licensing summary surfaced as a trust signal
//   • faqs       — 6–8 location-aware Q&As (FAQPage schema-eligible)
//   • howToChoose— vetting checklist for the client
//
// Strings may contain `{{suburb}}` and `{{state}}` placeholders. The render
// helper at the bottom of this file substitutes them at request time so
// every landing page reads naturally for its specific location — this is
// what keeps 15,000 generated pages from being marked thin content.
//
// Coverage: top 12 high-search-volume trades. Trades without an entry
// fall back to FALLBACK_CONTENT so every page still has substantive copy.
// ─────────────────────────────────────────────────────────────────────────────

export interface CostGuideRow {
  job: string;
  /** Low end of typical AUD range, in dollars (not cents). */
  low: number;
  /** High end of typical AUD range, in dollars (not cents). */
  high: number;
  /** "per hour", "per job", "per m²" — how the price is quoted. */
  unit: string;
  /** Optional caveat shown beneath the row. */
  note?: string;
}

export interface TradeFAQ {
  q: string;
  a: string;
}

export interface TradeContent {
  intro: string;
  whatTheyDo: string[];
  costGuide: CostGuideRow[];
  licenseNote: string;
  faqs: TradeFAQ[];
  howToChoose: string[];
}

const PLUMBER: TradeContent = {
  intro:
    "Plumbers in {{suburb}} handle everything from a dripping kitchen tap to a full bathroom rough-in. In {{state}}, anything that connects to mains water, gas, or drainage legally has to be done by a licensed plumber — DIY work on those systems voids home insurance and can be removed by a future buyer's inspector. The tradies listed below are ABN-verified, licence-checked, and their fee sits in Stripe-held escrow until you sign off the work.",
  whatTheyDo: [
    'Blocked drains, toilets, and stormwater',
    'Hot water systems — install, service, replace',
    'Tap, mixer, and cistern repair or replacement',
    'Gas fitting (separate licence, ask before booking)',
    'Bathroom and kitchen rough-in for renovations',
    'Backflow prevention device testing and reporting',
    'Leak detection and pipe repair',
  ],
  costGuide: [
    { job: 'Call-out + first 30 min', low: 90, high: 180, unit: 'per visit', note: 'Most plumbers in {{suburb}} charge a fixed call-out before any work begins.' },
    { job: 'Standard hourly rate', low: 90, high: 150, unit: 'per hour' },
    { job: 'Blocked drain — basic clear', low: 180, high: 400, unit: 'per job' },
    { job: 'Toilet replacement', low: 350, high: 700, unit: 'per job', note: 'Excludes the toilet suite itself.' },
    { job: 'Hot water unit — gas storage swap', low: 1400, high: 2600, unit: 'per job' },
    { job: 'Hot water unit — heat pump install', low: 4500, high: 6500, unit: 'per job', note: 'Often offset by rebates in {{state}}.' },
    { job: 'Full bathroom rough-in (plumbing only)', low: 1800, high: 4000, unit: 'per job' },
    { job: 'After-hours / emergency surcharge', low: 50, high: 200, unit: 'on top' },
  ],
  licenseNote:
    "All plumbers quoting on ConnecTradie hold a current contractor's licence with their state regulator (e.g. NSW Fair Trading, VBA in Victoria, QBCC in Queensland) — we verify before they can submit a quote on a plumbing job. Unlicensed plumbing work in {{state}} carries fines of $5,000+ and voids most home and contents insurance policies.",
  faqs: [
    {
      q: 'How much does a plumber cost in {{suburb}}?',
      a: 'Most {{suburb}} plumbers charge a call-out fee of $90–$180 covering the first 30 minutes, then $90–$150 per hour after that. Small jobs like a tap washer typically come in under $200. Hot water swaps run $1,400–$2,600 for like-for-like, more for a heat pump. Always ask whether the quote is fixed-price or hourly before work starts.',
    },
    {
      q: 'Do I need a licensed plumber in {{state}}?',
      a: 'Yes for anything connected to mains water, gas, or drainage. In {{state}} a licence is mandatory, and unlicensed work can void your home insurance and be ordered removed during a building inspection if you sell. The plumbers listed here are licence-verified.',
    },
    {
      q: 'How quickly can a {{suburb}} plumber attend an emergency?',
      a: 'For burst pipes, gas leaks, or no hot water in winter, most {{suburb}}-area plumbers can attend within 2–4 hours during business hours and 1–3 hours after-hours. Use the message-now button on a tradie\'s profile to confirm same-day availability. After-hours and weekend rates usually add $50–$200 to the call-out.',
    },
    {
      q: 'What\'s the difference between a plumber and a gas fitter?',
      a: 'Many plumbers also hold a gas licence, but gas fitting is a separate ticket. If your job involves gas appliances, gas hot water, or LPG conversions, confirm the tradie\'s licence covers gas work before they quote. Their {{state}} licence number is visible on their profile.',
    },
    {
      q: 'Can I get a fixed-price quote instead of an hourly rate?',
      a: 'For defined jobs like a tap replacement, hot water swap, or bathroom rough-in, most plumbers will give a fixed-price quote after a quick site visit or photos. Diagnostic work (chasing a leak, clearing a blockage of unknown cause) is usually quoted hourly because the scope is unknown until they start.',
    },
    {
      q: 'How is the payment protected?',
      a: 'When you accept a quote, the full amount is held by Stripe in escrow — ConnecTradie never holds your money. The plumber only gets paid after you mark the job complete and approve the release. If you don\'t respond, funds auto-release 48 hours after they mark the job done, which protects them from being ghosted while still giving you a window to dispute.',
    },
  ],
  howToChoose: [
    'Check their {{state}} plumbing licence number is current — it\'s on every profile.',
    'Ask if the quote is fixed-price or hourly, and whether the call-out is included.',
    'Read the last 5 reviews — pattern-spot for "showed up on time" and "left the site clean".',
    'Confirm public liability cover ($5M minimum is industry standard).',
    'For hot water replacements, ask about energy rebates — your tradie should know what {{state}} offers.',
  ],
};

const ELECTRICIAN: TradeContent = {
  intro:
    "Electricians in {{suburb}} cover everything from a single power point through to full house rewiring and switchboard upgrades. Electrical work is legally restricted to licensed electricians in {{state}} — DIY is illegal beyond changing a light globe, and unlicensed work voids home insurance. Every electrician on ConnecTradie is licence-verified before they can quote.",
  whatTheyDo: [
    'Power points, light switches, and ceiling fans',
    'Switchboard upgrades and safety switch (RCD) installation',
    'LED downlight retrofits and lighting redesigns',
    'Smoke alarm installation and testing (legally required)',
    'EV charger installation (Type 2 and DC)',
    'Solar panel and battery wiring and connection',
    'Data, TV antenna, and CCTV cabling',
    'Pre-purchase electrical safety inspections',
  ],
  costGuide: [
    { job: 'Call-out + first 30 min', low: 90, high: 180, unit: 'per visit' },
    { job: 'Standard hourly rate', low: 90, high: 150, unit: 'per hour' },
    { job: 'New power point install', low: 130, high: 280, unit: 'per outlet' },
    { job: 'LED downlight install', low: 65, high: 110, unit: 'per light', note: 'Cheaper in bulk — most {{suburb}} sparkies do 10+ at a time.' },
    { job: 'Switchboard upgrade', low: 1500, high: 3500, unit: 'per job', note: 'Required for solar, EV chargers, or older fuse boxes.' },
    { job: 'Smoke alarm install (mains)', low: 130, high: 220, unit: 'per alarm' },
    { job: 'EV charger install (Type 2)', low: 1200, high: 2800, unit: 'per job' },
    { job: 'Full house rewire', low: 8000, high: 18000, unit: 'per house', note: 'Varies wildly by house size, access, and {{state}} compliance requirements.' },
  ],
  licenseNote:
    "All electricians on ConnecTradie hold a current {{state}} electrical contractor's licence — verified before they can quote. Unlicensed electrical work in Australia carries fines up to $40,000 in some states and is a leading cause of house fires. If a quote sounds too cheap, ask for the licence number and check it with your state regulator.",
  faqs: [
    {
      q: 'How much does an electrician cost in {{suburb}}?',
      a: 'Standard rate in {{suburb}} runs $90–$150 per hour after a $90–$180 call-out. Small jobs like adding a power point are usually $130–$280 each. Bigger work like switchboard upgrades is fixed-priced from $1,500. Always ask whether GST is included and whether materials are billed separately.',
    },
    {
      q: 'Do I legally need an electrician in {{state}}?',
      a: 'Yes for anything beyond changing a light globe or plug-in appliance. {{state}} law restricts wiring, switch and outlet work, and any work inside the switchboard to licensed electricians. Insurance will refuse claims on DIY electrical work, and councils can order it removed at sale.',
    },
    {
      q: 'How many LED downlights do I need per room?',
      a: 'Rule of thumb in {{suburb}} homes: kitchens 4–6, living rooms 4–8, bedrooms 2–4, bathrooms 1–2 plus a mirror light. Your electrician will lay out a plan after seeing the room and ceiling space. Most modern downlights run 7–10W and replace 50W halogens.',
    },
    {
      q: 'My switchboard has ceramic fuses — should I upgrade?',
      a: 'Yes. Ceramic-fuse switchboards (common in {{suburb}} homes pre-1990) don\'t have safety switches (RCDs), which protect against electrocution. {{state}} now requires safety switches on at least the power and lighting circuits, and an upgrade is mandatory if you\'re adding solar, an EV charger, or doing significant renovation work.',
    },
    {
      q: 'Can the same electrician install solar and an EV charger?',
      a: 'Many can — solar requires a separate Clean Energy Council accreditation on top of the electrical licence. Filter by service category to find solar-accredited electricians in {{suburb}}. EV charger install is within scope of a standard electrical licence.',
    },
    {
      q: 'How does payment and escrow work?',
      a: 'Your payment is held by Stripe — not by ConnecTradie — until you mark the job complete. The electrician sees the funds are committed before they start, so you never pay upfront. After completion, you release the funds with one click, or they auto-release 48 hours later.',
    },
  ],
  howToChoose: [
    'Verify the {{state}} electrical licence number — visible on every profile.',
    'For solar work, check Clean Energy Council accreditation.',
    'Ask for a copy of the certificate of compliance (CoC) at completion — required in {{state}}.',
    'Confirm $5M public liability insurance.',
    'Read recent reviews for callback patterns — good electricians get repeat work.',
  ],
};

const CARPENTER: TradeContent = {
  intro:
    "Carpenters in {{suburb}} handle structural timber work, finishing carpentry, decks, pergolas, doors, and built-ins. While general carpentry doesn\'t require a state licence in {{state}}, structural work that\'s part of a build over a certain value usually falls under a builder\'s licence. The carpenters listed here are ABN-verified, insured, and paid through Stripe escrow.",
  whatTheyDo: [
    'Decking — install, repair, re-stain',
    'Pergolas, patios, and outdoor structures',
    'Internal and external door installation',
    'Skirting, architraves, and trim work',
    'Built-in wardrobes and shelving',
    'Subfloor and timber framing repair',
    'Window replacement and weatherboard work',
  ],
  costGuide: [
    { job: 'Hourly rate', low: 70, high: 110, unit: 'per hour' },
    { job: 'Day rate', low: 600, high: 900, unit: 'per day' },
    { job: 'Hardwood deck — supply and install', low: 320, high: 550, unit: 'per m²', note: 'Spotted gum or merbau, common in {{suburb}}.' },
    { job: 'Composite deck — supply and install', low: 380, high: 600, unit: 'per m²' },
    { job: 'Pergola — timber, attached', low: 4500, high: 12000, unit: 'per job' },
    { job: 'Internal door install (supply not incl.)', low: 180, high: 340, unit: 'per door' },
    { job: 'Built-in wardrobe', low: 1800, high: 4500, unit: 'per linear m' },
  ],
  licenseNote:
    "General carpentry work in {{state}} doesn\'t require a state contractor\'s licence, but jobs that involve structural changes, alterations to load-bearing elements, or full builds over the state\'s value threshold (usually $5,000–$10,000) require a builder\'s licence. Carpenters offering bigger jobs on ConnecTradie will have the appropriate licence on file.",
  faqs: [
    {
      q: 'How much does a carpenter cost in {{suburb}}?',
      a: 'Carpenters in {{suburb}} usually charge $70–$110 per hour, or $600–$900 per day for bigger jobs. Decks and pergolas are usually quoted as fixed-price packages including materials. Always confirm whether timber and fasteners are in-scope.',
    },
    {
      q: 'How long does a deck take to build in {{suburb}}?',
      a: 'A standard 25m² hardwood deck takes 4–6 working days for two carpenters — substrate prep, framing, decking boards, oil. Council approval may be needed in {{state}} for decks over a certain height, so factor in 2–6 weeks lead time if approval is required.',
    },
    {
      q: 'Do I need council approval for a pergola in {{suburb}}?',
      a: 'It depends on size, height, and how close to the boundary it sits. Most {{state}} councils exempt small detached pergolas but require approval for attached structures over 25m² or close to the boundary. Your {{suburb}} carpenter will usually know the local rules — confirm before they quote.',
    },
    {
      q: 'What timber should I use for a deck in {{suburb}}\'s climate?',
      a: 'Spotted gum and merbau are the standard hardwoods for {{state}} outdoor decking — durable, beautiful grain, ages to silver-grey if left unoiled. Composite decking lasts longer with less maintenance but costs 20–30% more upfront. Treated pine is cheapest but won\'t last as long in coastal humidity.',
    },
    {
      q: 'How is the work guaranteed?',
      a: 'Your payment sits in Stripe escrow until you approve the work. If the deck isn\'t to spec, you don\'t release the funds. Reputable carpenters also offer a workmanship warranty of 6–12 months beyond the escrow release — ask before booking.',
    },
  ],
  howToChoose: [
    'Check their portfolio — most {{suburb}} carpenters have a profile gallery.',
    'Ask whether timber is supplied or owner-supply.',
    'Confirm public liability ($5M minimum) and that they hold the right licence if the job is structural.',
    'Pin down a fixed-price quote rather than time-and-materials for bigger jobs.',
    'Read the last 5 reviews looking for "stuck to the quote" and "tidy site" comments.',
  ],
};

const BUILDER: TradeContent = {
  intro:
    "Builders in {{suburb}} handle extensions, renovations, new builds, granny flats, and major structural work. Every builder taking on residential work over the state value threshold in {{state}} must hold a current builder\'s licence and home indemnity insurance — both verified by ConnecTradie before they can quote.",
  whatTheyDo: [
    'New home construction',
    'Extensions and additions',
    'Full renovations',
    'Granny flat / secondary dwelling builds',
    'Structural alterations and load-bearing wall removal',
    'Commercial fit-out',
    'Knock-down rebuilds',
  ],
  costGuide: [
    { job: 'Standard renovation rate', low: 2500, high: 4500, unit: 'per m²', note: 'Higher end for kitchens, bathrooms, premium finishes.' },
    { job: 'New home — project home spec', low: 1800, high: 2800, unit: 'per m²' },
    { job: 'New home — custom build', low: 2800, high: 5500, unit: 'per m²' },
    { job: 'Single-room extension (basic)', low: 35000, high: 80000, unit: 'per job' },
    { job: 'Granny flat — 60m² turnkey', low: 120000, high: 220000, unit: 'per job', note: 'Varies by {{state}} regs and slab requirements.' },
    { job: 'Kitchen renovation', low: 18000, high: 45000, unit: 'per job' },
    { job: 'Bathroom renovation', low: 18000, high: 35000, unit: 'per job' },
  ],
  licenseNote:
    "All builders on ConnecTradie hold a current {{state}} builder\'s licence and home indemnity / home warranty insurance — verified before quote submission. For any residential job over the state threshold (typically $5,000–$20,000), this is legally mandatory. Building unlicensed in {{state}} carries fines of $11,000+ for individuals.",
  faqs: [
    {
      q: 'How much does a renovation cost per m² in {{suburb}}?',
      a: 'Renovation costs in {{suburb}} run $2,500–$4,500 per m² for a standard residential refurbish, climbing to $5,500+ for high-end work with premium finishes. Kitchen and bathroom work pulls the average up because of fixture cost. Get at least three line-item quotes — variability comes from inclusions, not labour rates.',
    },
    {
      q: 'How long does a {{suburb}} extension take?',
      a: 'A single-room extension in {{suburb}} usually runs 12–20 weeks from site start, plus 8–16 weeks for council approval beforehand. Two-storey additions add 4–8 weeks. The biggest variable is approval lead-time in {{state}}, which can compress if you go private certifier.',
    },
    {
      q: 'What\'s home indemnity insurance and why does it matter?',
      a: 'Home indemnity insurance (called home warranty in some states) protects you if the builder dies, becomes insolvent, or disappears mid-job. In {{state}} it\'s legally required for any job over the state value threshold and the builder must provide a certificate before you pay a deposit. ConnecTradie checks this on every builder profile.',
    },
    {
      q: 'Should I pay a deposit?',
      a: 'In most states, deposits on residential building work are capped — typically 10% for jobs under $20,000 and 5% above. Anything more is illegal in {{state}}. With ConnecTradie, you don\'t pay a deposit directly to the builder — the full milestone amount sits in Stripe escrow and releases as you sign off each stage.',
    },
    {
      q: 'How are payments structured for a long build?',
      a: 'Big builds run on milestone payments — typically frame, lock-up, fixing, completion. Each milestone is held in escrow and only released when you sign off that stage. If a milestone is in dispute, the funds stay locked and ConnecTradie\'s mediation kicks in. This is genuinely different from paying invoices off-platform.',
    },
  ],
  howToChoose: [
    'Verify the {{state}} builder\'s licence number — current, active, no recent complaints.',
    'Ask for home indemnity insurance certificate before paying anything.',
    'Get itemised quotes from at least three builders — look at inclusions, not just totals.',
    'Drive past two recent jobs in {{suburb}} and talk to the homeowners.',
    'Pin down the start date AND the contract\'s liquidated damages clause for late completion.',
  ],
};

const PAINTER: TradeContent = {
  intro:
    "Painters in {{suburb}} cover everything from a single feature wall to full interior and exterior repaints, weatherboard work, and commercial premises. While general painting doesn\'t require a state licence in {{state}}, working with lead paint or at height above 2m brings additional safety requirements. The painters listed here are ABN-verified and insured.",
  whatTheyDo: [
    'Interior painting — full house or selected rooms',
    'Exterior painting — render, weatherboard, brick',
    'Commercial premises and shopfronts',
    'Cabinet and door respray',
    'Decorative finishes — Venetian, limewash, feature walls',
    'Lead paint removal (requires extra cert)',
    'Wallpaper installation and removal',
  ],
  costGuide: [
    { job: 'Standard 2-coat interior wall', low: 35, high: 55, unit: 'per m²', note: 'Includes prep, drop sheets, paint.' },
    { job: 'Whole-house interior repaint (3BR)', low: 4500, high: 9000, unit: 'per job' },
    { job: 'Single room repaint', low: 600, high: 1400, unit: 'per room' },
    { job: 'Exterior — weatherboard repaint', low: 45, high: 75, unit: 'per m²' },
    { job: 'Exterior — render or brick', low: 35, high: 60, unit: 'per m²' },
    { job: 'Ceiling repaint', low: 25, high: 40, unit: 'per m²' },
    { job: 'Feature wall (high-quality paint)', low: 280, high: 600, unit: 'per wall' },
  ],
  licenseNote:
    "Painting in {{state}} doesn\'t require a state contractor\'s licence for most jobs, but tradies working on heritage-listed buildings, in commercial premises, or at height above 2 metres need additional safety tickets. Lead paint removal (relevant in {{suburb}} homes built before 1970) requires a specific certification — ask before they start.",
  faqs: [
    {
      q: 'How much does a 3-bedroom repaint cost in {{suburb}}?',
      a: 'A standard 3-bedroom interior repaint in {{suburb}} runs $4,500–$9,000 depending on ceiling heights, paint quality, and how much prep the walls need. Two coats throughout, drop sheets, masking, and one feature wall would land at the upper end. Exterior work is quoted separately.',
    },
    {
      q: 'How long does a {{suburb}} house repaint take?',
      a: 'A two-painter crew finishes a typical {{suburb}} 3-bedroom interior in 4–7 days including drying time between coats. Exterior repaints take 6–12 days depending on weather, surface prep, and whether scaffolding is needed.',
    },
    {
      q: 'What paint quality should I ask for?',
      a: 'For interior walls, ask for a "low-sheen" or "matt" wash-and-wear paint from a recognised brand (Dulux, Taubmans, Wattyl). Bathrooms and kitchens need acrylic semi-gloss. Cheap painter\'s grade paint costs 30% less but covers worse and fades faster — your {{suburb}} painter should default to mid-range trade paint.',
    },
    {
      q: 'Do I need to move furniture and remove fixtures?',
      a: 'Most painters bring drop sheets and move furniture themselves, but it speeds the job up if you remove anything fragile, take pictures off walls, and clear paths. Curtain removal is usually outside scope. Confirm on the quote — some painters charge extra for furniture-moving.',
    },
    {
      q: 'My home was built in 1965 — could the paint contain lead?',
      a: 'Yes, paint applied in {{state}} before 1970 likely contains lead. A standard repaint over intact lead paint is safe, but sanding, scraping, or removing it requires specific safety protocols and a tradie with lead-paint certification. Ask before they start prep.',
    },
  ],
  howToChoose: [
    'Walk through a sample of the painter\'s recent work in {{suburb}} — most have a portfolio.',
    'Ask whether the quote includes paint, drop sheets, and minor patching, or just labour.',
    'Confirm two coats minimum — anyone quoting one coat is cutting corners.',
    'For exteriors, ask about prep — sanding, priming, gap-filling — which is 50% of the labour.',
    'Read recent reviews looking for "left the site clean" and "stuck to the quote".',
  ],
};

const CLEANER: TradeContent = {
  intro:
    "Cleaners in {{suburb}} cover regular house cleaning, end-of-lease bond cleans, deep cleans, office work, carpet shampoo, and window cleaning. Cleaning doesn\'t require a state licence, but for bond cleans the cleaner should follow the {{state}} REINSW / REIV-aligned checklist so the property passes inspection. The cleaners on ConnecTradie are ABN-verified and insured.",
  whatTheyDo: [
    'Regular house cleaning — weekly, fortnightly, monthly',
    'End-of-lease / bond cleans with checklist',
    'Deep clean (move-in or seasonal)',
    'Office and commercial cleans',
    'Carpet shampoo and steam clean',
    'Oven, BBQ, and rangehood detail clean',
    'Window cleaning (interior and reachable exterior)',
    'After-builders / renovation clean',
  ],
  costGuide: [
    { job: 'Standard regular clean (2BR apartment)', low: 90, high: 160, unit: 'per visit' },
    { job: 'Standard regular clean (3BR house)', low: 130, high: 240, unit: 'per visit' },
    { job: 'End-of-lease bond clean (3BR)', low: 380, high: 680, unit: 'per job', note: 'Higher in {{suburb}} for properties with carpets, ovens, or balconies.' },
    { job: 'Deep clean (one-off, 3BR)', low: 280, high: 480, unit: 'per job' },
    { job: 'Carpet steam clean', low: 35, high: 60, unit: 'per room' },
    { job: 'Window clean (interior + reachable exterior)', low: 8, high: 18, unit: 'per window' },
    { job: 'Office regular clean', low: 35, high: 75, unit: 'per hour' },
  ],
  licenseNote:
    "Cleaning doesn\'t require a state contractor\'s licence in {{state}}, but reputable cleaners carry public liability insurance ($5M+) and provide an ABN. For bond cleans, ask whether they guarantee the bond — most professionals will return free if anything fails inspection.",
  faqs: [
    {
      q: 'How much does a regular house clean cost in {{suburb}}?',
      a: 'A standard fortnightly clean of a 3-bedroom {{suburb}} house runs $130–$240, depending on size, condition, and inclusions. Two-bedroom apartments are $90–$160. Most cleaners offer 10–15% discounts for weekly bookings vs one-off cleans.',
    },
    {
      q: 'Is a bond clean guaranteed?',
      a: 'Yes — most professional {{suburb}} bond cleaners offer a 72-hour bond-back guarantee. If the agent flags anything on inspection, they return and re-clean free. Confirm the guarantee in writing on the quote before booking, and keep the agent\'s inspection report.',
    },
    {
      q: 'What\'s included in an end-of-lease clean?',
      a: 'A standard {{state}}-compliant bond clean includes inside all cupboards, oven, rangehood, stovetop, dishwasher, all bathrooms (incl. tiles and grout), walls spot-clean, skirting, blinds, light fittings, and inside windows. Carpets are usually separate — confirm whether steam clean is included or quoted separately.',
    },
    {
      q: 'Should I provide cleaning supplies?',
      a: 'Most {{suburb}} cleaners bring all supplies and equipment as standard. Some clients prefer their cleaner uses specific products (eco, fragrance-free, particular brands) — note this in your booking and the cleaner will accommodate. Vacuum cleaners are usually owner-supplied for regular cleans.',
    },
    {
      q: 'Can I book the same cleaner every fortnight?',
      a: 'Yes — most {{suburb}} cleaners on ConnecTradie offer recurring bookings with the same cleaner attending each visit. Recurring services are auto-invoiced and paid via direct debit if you set it up — no chasing or remembering to pay.',
    },
  ],
  howToChoose: [
    'Confirm whether supplies and equipment are included or owner-supplied.',
    'For bond cleans, ask about the bond-back guarantee in writing.',
    'Verify insurance — accidents happen and you don\'t want a broken mirror at your expense.',
    'Read the last 5 reviews, looking for "reliable" and "thorough" rather than just "nice".',
    'Match cleaner to job type — bond cleaners and regular cleaners are different specialisations.',
  ],
};

const ROOFER: TradeContent = {
  intro:
    "Roofers in {{suburb}} handle repairs, re-roofing, gutter replacement, leaks, roof restoration, and skylights. Roofing in {{state}} requires both height-safety tickets and (in most states) a roofing or carpentry trade licence for structural work. ConnecTradie verifies both before a roofer can quote.",
  whatTheyDo: [
    'Leak detection and repair',
    'Tile replacement and re-bedding',
    'Full re-roofing (Colorbond or tile)',
    'Gutter and downpipe replacement',
    'Roof restoration — clean, repoint, recoat',
    'Skylight and roof window installation',
    'Whirlybird and ventilation install',
    'Insurance reports for storm damage',
  ],
  costGuide: [
    { job: 'Inspection + written report', low: 220, high: 450, unit: 'per visit' },
    { job: 'Minor tile / ridge cap repair', low: 280, high: 700, unit: 'per visit' },
    { job: 'Roof restoration (clean + recoat)', low: 3500, high: 7000, unit: 'per house', note: 'Tiled roofs in {{suburb}}.' },
    { job: 'Full re-roof — Colorbond', low: 8000, high: 18000, unit: 'per house' },
    { job: 'Full re-roof — tile to Colorbond', low: 14000, high: 28000, unit: 'per house' },
    { job: 'Gutter replacement', low: 45, high: 90, unit: 'per linear m' },
    { job: 'Whirlybird install', low: 280, high: 600, unit: 'per unit' },
    { job: 'Skylight install', low: 1200, high: 3500, unit: 'per skylight' },
  ],
  licenseNote:
    "Roofers in {{state}} typically require a state building / roofing licence for any structural work plus height-safety tickets and a SafeWork-aligned working-at-heights certification. ConnecTradie verifies both — and roofers without the right tickets cannot quote on a roofing job.",
  faqs: [
    {
      q: 'How much does it cost to replace a roof in {{suburb}}?',
      a: 'A full Colorbond re-roof on a standard 3-bedroom {{suburb}} house runs $8,000–$18,000. Tile-to-Colorbond conversions are $14,000–$28,000 because the underlying frame often needs reinforcement. Get two written quotes that itemise materials, sarking, capping, and removal of old material.',
    },
    {
      q: 'My roof is leaking after the last storm — what should I do first?',
      a: 'Get a written inspection report ($220–$450) before lodging an insurance claim. Many {{suburb}} roofers provide insurance-ready reports that document the cause and quote the repair. If you go straight to repair without a report, the insurer may push back on the claim.',
    },
    {
      q: 'How long does a re-roof take?',
      a: 'A standard {{suburb}} re-roof in good weather takes 3–6 days for a single-storey home. Tile-to-Colorbond conversions add 1–2 days for framing checks. Weather delays are common in winter — most roofers won\'t work in heavy rain for safety reasons.',
    },
    {
      q: 'What\'s involved in a roof restoration vs a re-roof?',
      a: 'A restoration cleans, repoints ridge capping, replaces broken tiles, and recoats the existing roof — extending its life by 10–15 years for around $3,500–$7,000. A re-roof replaces everything down to the battens. If your tiles are crumbling or the roof is over 35 years old, re-roof. Otherwise restoration is usually the better economics.',
    },
    {
      q: 'Are gutter guards worth it in {{suburb}}?',
      a: 'In {{suburb}} areas with heavy tree cover or near bushland, yes — gutter guards prevent leaf litter blocking downpipes during storms and reduce fire ember entry. Mesh guards run $25–$45 per linear metre installed. In open suburbs with little tree drop, the ROI is weaker.',
    },
  ],
  howToChoose: [
    'Verify {{state}} building/roofing licence and working-at-heights certification.',
    'Get a written report before any work — especially for insurance claims.',
    'Ask about the warranty — quality roofers offer 10–25 years on workmanship.',
    'Confirm waste removal and skip hire is included in the quote.',
    'Check public liability ($10M is preferred for roofers given the risks involved).',
  ],
};

const TILER: TradeContent = {
  intro:
    "Tilers in {{suburb}} handle bathroom and kitchen tiling, splashbacks, outdoor paving, pool surrounds, and waterproofing. Bathroom waterproofing in {{state}} is legally restricted work — it must be carried out by a licensed waterproofer (often the same person as the tiler, but separately certified). ConnecTradie verifies both tickets before they can quote.",
  whatTheyDo: [
    'Bathroom and ensuite tiling',
    'Kitchen splashback',
    'Floor tiling — porcelain, ceramic, stone',
    'Outdoor paving and patio',
    'Pool tiling and waterline',
    'Waterproofing (wet areas)',
    'Tile repair, regrout, and reseal',
  ],
  costGuide: [
    { job: 'Standard tiling rate (supply not incl.)', low: 65, high: 110, unit: 'per m²', note: 'Excludes tiles, adhesive, grout.' },
    { job: 'Mosaic / patterned tile install', low: 110, high: 180, unit: 'per m²' },
    { job: 'Bathroom tiling — floor and walls only', low: 4500, high: 9000, unit: 'per bathroom', note: '{{suburb}}-area average for ~5m² bathroom.' },
    { job: 'Kitchen splashback (tile only)', low: 800, high: 1800, unit: 'per kitchen' },
    { job: 'Waterproofing (wet area)', low: 45, high: 75, unit: 'per m²' },
    { job: 'Regrout and reseal', low: 25, high: 45, unit: 'per m²' },
    { job: 'Outdoor paving (stone or porcelain)', low: 90, high: 160, unit: 'per m²' },
  ],
  licenseNote:
    "Tilers in {{state}} don\'t need a contractor\'s licence for the tiling itself in most cases, but waterproofing wet areas requires a separate waterproofing certification. Always confirm your tiler holds the waterproofing ticket — otherwise the job needs a separate trade and the warranty stack gets messy.",
  faqs: [
    {
      q: 'How much does it cost to tile a bathroom in {{suburb}}?',
      a: 'A standard 5–6m² {{suburb}} bathroom (floor and walls) runs $4,500–$9,000 for tiling labour and waterproofing, excluding the tiles themselves. Tile cost varies wildly — from $30/m² for basic porcelain to $200+/m² for natural stone. Always quote tile and labour separately.',
    },
    {
      q: 'Does the tiler do the waterproofing too?',
      a: 'Often yes, but it\'s a separate certification. In {{state}}, wet-area waterproofing is restricted work — the certifier signs off on it and stands behind it warranty-wise. On ConnecTradie, tilers who hold the waterproofing ticket are flagged so you don\'t end up with two trades and a finger-pointing problem.',
    },
    {
      q: 'How long does a bathroom tile job take?',
      a: 'A {{suburb}} bathroom tiling job (after demolition is done) usually runs 5–8 working days — waterproofing membrane needs 24–48 hours to cure, then floor tiles, then wall tiles, then grout. Add another 24 hours for grout to cure before silicone and use.',
    },
    {
      q: 'What\'s the difference between regrouting and retiling?',
      a: 'Regrouting replaces just the grout lines — $25–$45/m² — and is a 1–2 day job that refreshes a tired bathroom without replacing tiles. Retiling is a 5–8 day full strip and replace at 10× the cost. If your tiles are sound but the grout is cracked or mouldy, regrout first.',
    },
    {
      q: 'Should I supply my own tiles?',
      a: 'You can — most {{suburb}} tilers will work with owner-supplied tiles and quote labour separately. Trade-supplied tiles are usually 10–20% cheaper than retail (they get supplier discounts) but you give up some choice. Get the labour-only quote first, then compare tile cost yourself.',
    },
  ],
  howToChoose: [
    'Confirm waterproofing certification if a wet area is involved.',
    'Walk through their last 3 jobs photographically — straight lines and clean grout are the tell.',
    'Get tile and labour quoted separately so you can shop tiles independently.',
    'Ask about the warranty on waterproofing — minimum 7 years in most states.',
    'Confirm tile waste is included in disposal (a typical bathroom generates ~200kg).',
  ],
};

const LANDSCAPER: TradeContent = {
  intro:
    "Landscapers in {{suburb}} cover garden design, retaining walls, paving, turf, irrigation, and ongoing maintenance. While general landscaping doesn\'t require a state licence in {{state}}, retaining walls over a certain height and any irrigation work that connects to mains water do require licensed trades. The landscapers on ConnecTradie are ABN-verified and insured.",
  whatTheyDo: [
    'Garden design and complete makeovers',
    'Retaining walls (timber, concrete, stone)',
    'Paving and outdoor patios',
    'Turf supply and installation',
    'Irrigation system design and install',
    'Garden bed prep, mulching, planting',
    'Hedge trimming and ongoing maintenance',
    'Outdoor lighting',
  ],
  costGuide: [
    { job: 'Hourly maintenance rate', low: 65, high: 95, unit: 'per hour' },
    { job: 'Full garden makeover (small backyard)', low: 8000, high: 25000, unit: 'per job', note: '{{suburb}} typical for under 80m².' },
    { job: 'Turf supply and install', low: 28, high: 55, unit: 'per m²' },
    { job: 'Retaining wall — timber sleeper', low: 280, high: 450, unit: 'per m²' },
    { job: 'Retaining wall — concrete block', low: 380, high: 650, unit: 'per m²' },
    { job: 'Paving (stone or porcelain)', low: 120, high: 220, unit: 'per m²' },
    { job: 'Irrigation install (small garden)', low: 1200, high: 3500, unit: 'per job' },
    { job: 'Mulch supply and spread', low: 95, high: 160, unit: 'per m³ delivered' },
  ],
  licenseNote:
    "General landscaping in {{state}} doesn\'t require a state contractor\'s licence, but retaining walls over a certain height (usually 1m, sometimes 600mm depending on council) need a licensed builder, and irrigation work that connects to mains needs a licensed plumber. Larger landscape projects over the state value threshold need a builder\'s licence.",
  faqs: [
    {
      q: 'How much does it cost to landscape a backyard in {{suburb}}?',
      a: 'A small {{suburb}} backyard makeover (under 80m²) including new turf, garden beds, and basic paving runs $8,000–$25,000. Bigger gardens with retaining walls, irrigation, lighting, and outdoor entertaining areas scale to $50,000+. The biggest cost driver is hard landscaping (paving, retaining), not plants.',
    },
    {
      q: 'When is the best time to lay turf in {{suburb}}?',
      a: 'For {{state}} climates, autumn (March–May) and spring (September–November) are ideal — soil is warm, rain is reliable, and grass establishes before summer heat or winter dormancy. Summer turf is doable but needs daily watering for the first 3 weeks. Avoid mid-winter laying.',
    },
    {
      q: 'Do I need council approval for a retaining wall?',
      a: 'Yes for walls over a certain height — usually 1m in {{state}}, sometimes 600mm depending on your council. Walls over the limit also need engineering certification. Your {{suburb}} landscaper should know the local rules and factor approval costs into the quote.',
    },
    {
      q: 'How do recurring garden maintenance bookings work?',
      a: 'Most {{suburb}} landscapers offer recurring fortnightly or monthly maintenance — mowing, edging, weeding, hedge trim. On ConnecTradie, these auto-invoice and direct-debit so you never have to chase a tradie or remember to pay. You can pause or cancel anytime.',
    },
    {
      q: 'Should I supply plants and materials?',
      a: 'You can, but trade-supplied is often cheaper because landscapers get nursery and stone-yard discounts. The risk with owner-supplied is the tradie warranty on plant survival drops — if they didn\'t source it, they don\'t guarantee it. For mulch, soil, and turf, trade-supply is almost always faster and cheaper than DIY.',
    },
  ],
  howToChoose: [
    'Look at their portfolio for projects in similar {{suburb}} conditions (sun, soil, slope).',
    'Confirm public liability cover and insurance for any structural work.',
    'For retaining walls over 1m, ask for the engineer\'s certificate.',
    'Get itemised quotes — labour, materials, plants, mulch, removal of old turf etc.',
    'Pin down the maintenance plan in the first 6 months — new turf and plants need follow-up.',
  ],
};

const HANDYMAN: TradeContent = {
  intro:
    "Handymen in {{suburb}} cover the wide middle ground between DIY and licensed trade work — furniture assembly, shelving, minor repairs, gate fixes, door adjustments, gutter cleaning, and general property maintenance. Handymen can\'t do licensed work (plumbing, electrical, gas, structural building), but they\'re usually the most cost-effective option for everything else.",
  whatTheyDo: [
    'Furniture assembly (IKEA, Kmart, custom)',
    'Shelving, picture hanging, wall mounts',
    'Door, hinge, and lock adjustment',
    'Gate repair and minor fence patching',
    'Basic deck and timber maintenance',
    'Gutter cleaning (reachable from ladder)',
    'Garden bed prep and minor landscaping',
    'Pressure cleaning driveways and decks',
    'General property maintenance lists',
  ],
  costGuide: [
    { job: 'Standard hourly rate', low: 55, high: 90, unit: 'per hour' },
    { job: 'Minimum call-out (1–2 hours)', low: 110, high: 180, unit: 'per visit' },
    { job: 'Furniture assembly (typical)', low: 80, high: 250, unit: 'per item' },
    { job: 'TV wall mount + cable conceal', low: 180, high: 380, unit: 'per TV' },
    { job: 'Gutter clean (single-storey)', low: 220, high: 420, unit: 'per house' },
    { job: 'Pressure wash driveway', low: 280, high: 600, unit: 'per job' },
    { job: 'Property maintenance day rate', low: 450, high: 700, unit: 'per day' },
  ],
  licenseNote:
    "Handymen don\'t need a contractor\'s licence for general repairs and maintenance in {{state}}, but they legally can\'t perform plumbing, electrical, gas, structural building, or asbestos work — these all need licensed trades. If your handyman offers to do any of these, decline and book a licensed tradie. ConnecTradie\'s verification gate prevents this on the platform.",
  faqs: [
    {
      q: 'What does a handyman charge in {{suburb}}?',
      a: 'Most {{suburb}} handymen charge $55–$90 per hour with a 1–2 hour minimum call-out. For a half-day of mixed jobs (assemble bed, hang mirror, fix gate, mount TV), expect to pay $250–$450. Day rates run $450–$700 for full-day maintenance lists.',
    },
    {
      q: 'What CAN\'T a handyman do?',
      a: 'In {{state}}, handymen legally cannot do plumbing work (mains-connected), electrical work (beyond changing a globe), gas fitting, asbestos work, or structural building. They also can\'t certify any work that needs sign-off. If your job is on this list, you need a licensed tradie — ConnecTradie\'s filter does this matching automatically.',
    },
    {
      q: 'Can a handyman install a ceiling fan?',
      a: 'No — installing or replacing a hardwired ceiling fan requires a licensed electrician in {{state}}. A handyman can install a plug-in fan or assemble the body before an electrician connects it. Don\'t accept handyman quotes for hardwired electrical work; insurance won\'t cover any incident.',
    },
    {
      q: 'How do I bundle multiple small jobs together?',
      a: 'Best value with a {{suburb}} handyman is bundling 4–6 hours of work into one visit. Write a list, message the handyman with photos beforehand, and let them confirm the time estimate. You\'ll usually save 20–30% versus three separate visits because there\'s only one call-out fee.',
    },
    {
      q: 'Is the handyman insured if they damage something?',
      a: 'Yes — every handyman on ConnecTradie carries public liability insurance ($5M minimum). Their ABN and insurance are verified before they can quote. For high-value items (artwork, custom joinery, glass), still mention the value upfront so they can take appropriate care.',
    },
  ],
  howToChoose: [
    'Bundle jobs into one visit to save on call-out fees.',
    'Send photos of each job upfront so they bring the right tools.',
    'For items needing licensed work, the handyman should refer you to a licensed tradie.',
    'Confirm public liability insurance — accidents happen.',
    'Read recent reviews looking for "got more done than expected" rather than just "nice guy".',
  ],
};

const AIR_CONDITIONING: TradeContent = {
  intro:
    "Air conditioning installers and service techs in {{suburb}} handle split systems, ducted reverse cycle, multi-head systems, regular servicing, and gas top-ups. AC work in {{state}} requires both an electrical licence (for the wiring) and a refrigerant handling licence (for the gas) — ConnecTradie verifies both before the tradie can quote.",
  whatTheyDo: [
    'Split system supply and install',
    'Ducted reverse cycle install',
    'Multi-head (multi-room) system',
    'Existing system service and clean',
    'Gas top-up and leak repair',
    'Faulty system diagnostic and repair',
    'Annual maintenance plans',
    'Commercial premises HVAC',
  ],
  costGuide: [
    { job: 'Service call-out + diagnostic', low: 150, high: 280, unit: 'per visit' },
    { job: 'Annual service / clean', low: 180, high: 320, unit: 'per system' },
    { job: 'Split system supply + install (2.5kW)', low: 1400, high: 2400, unit: 'per system', note: 'Suits a bedroom or small living area.' },
    { job: 'Split system supply + install (7kW)', low: 2200, high: 3800, unit: 'per system' },
    { job: 'Ducted reverse cycle (3BR home)', low: 9000, high: 18000, unit: 'per house', note: '{{suburb}} install — varies with ceiling space and runs.' },
    { job: 'Gas top-up (R32 / R410)', low: 220, high: 480, unit: 'per system' },
    { job: 'Old system removal and disposal', low: 180, high: 380, unit: 'per system' },
  ],
  licenseNote:
    "AC installers in {{state}} must hold a current electrical contractor\'s licence (for the connection) and an ARCtick refrigerant handling licence (for the gas). Both are mandatory and both are verified on ConnecTradie before they can quote. Unlicensed AC work is illegal, voids insurance, and is a leading cause of refrigerant leaks in older Australian homes.",
  faqs: [
    {
      q: 'How much does it cost to install a split system in {{suburb}}?',
      a: 'A 2.5kW split system (suits a bedroom or small living room) runs $1,400–$2,400 supplied and installed in {{suburb}}. A 7kW unit for a larger living area is $2,200–$3,800. Most quotes include the head unit, outdoor compressor, basic pipe run up to 5m, and a tidy install. Long pipe runs, second-storey work, or brick walls add cost.',
    },
    {
      q: 'Split system or ducted?',
      a: 'For one or two rooms, splits are cheaper to buy and run — each room only cools when needed. For whole-house cooling in {{suburb}}, ducted reverse cycle is more comfortable and looks cleaner, but the install is $9,000–$18,000+. Hybrid setups (ducted main living, splits in bedrooms) are common in older {{state}} homes where ceiling space is tight.',
    },
    {
      q: 'How often does an AC unit need servicing?',
      a: 'Once per year is the manufacturer recommendation for {{suburb}} climate — clean the filter, check the gas pressure, vacuum the coils, test the drain. Most ConnecTradie clients book this as a recurring annual service that auto-renews and auto-invoices. Skipping servicing shortens system life by 30–40% and increases running costs.',
    },
    {
      q: 'My AC isn\'t cooling well — does it need gas?',
      a: 'Maybe. Modern AC systems shouldn\'t lose gas — if yours is low, there\'s usually a leak that needs fixing first. A {{suburb}} AC tech will do a leak test ($150–$280), fix the leak, then top up the gas ($220–$480). Just topping up without fixing the leak is a band-aid that loses the gas again within months.',
    },
    {
      q: 'Are there rebates for energy-efficient AC in {{state}}?',
      a: 'Often yes — {{state}} runs energy-efficiency schemes that offer rebates for high-star-rating systems replacing older units. Your installer should know which rebates apply and handle the paperwork. Ask before quote acceptance.',
    },
  ],
  howToChoose: [
    'Verify both the electrical licence AND the ARCtick refrigerant ticket.',
    'Get capacity right — too small struggles, too big short-cycles. Your installer should calculate this.',
    'Ask about pipe-run length — anything over 5m adds cost.',
    'Confirm warranty on parts (5+ years) and labour (1–2 years minimum).',
    'For rebates, ask whether the installer files the paperwork or leaves it to you.',
  ],
};

const BATHROOM_RENOVATOR: TradeContent = {
  intro:
    "Bathroom renovators in {{suburb}} handle the full scope — demolition, plumbing rough-in, waterproofing, electrical, tiling, fitting, finishing. A full bathroom renovation involves four licensed trades (builder, plumber, electrician, waterproofer), and the lead renovator coordinates them. In {{state}}, structural bathroom work requires a builder\'s licence and home indemnity insurance.",
  whatTheyDo: [
    'Full bathroom renovation, project-managed',
    'Ensuite, powder room, and laundry combo',
    'Accessibility / disability modifications',
    'Wet-area waterproofing (certified)',
    'Custom vanity, mirror, and shelving',
    'Underfloor heating',
    'Niche walls and feature lighting',
    'Heritage-style restoration',
  ],
  costGuide: [
    { job: 'Budget renovation (refresh)', low: 12000, high: 20000, unit: 'per bathroom', note: 'Same layout, new fixtures and finishes.' },
    { job: 'Standard full renovation (relayout)', low: 22000, high: 38000, unit: 'per bathroom', note: '{{suburb}} typical, mid-range fittings.' },
    { job: 'Premium renovation', low: 40000, high: 80000, unit: 'per bathroom' },
    { job: 'Ensuite addition (new room)', low: 18000, high: 40000, unit: 'per ensuite' },
    { job: 'Underfloor heating add-on', low: 1800, high: 3500, unit: 'per bathroom' },
    { job: 'Custom vanity (stone benchtop)', low: 2200, high: 5500, unit: 'per vanity' },
  ],
  licenseNote:
    "Bathroom renovators in {{state}} need a builder\'s licence (for structural and waterproofing oversight) plus home indemnity / warranty insurance for any job above the state value threshold (usually $5,000–$20,000). Plumbing, electrical, and waterproofing within the job each need their own licensed sub-trade — the renovator coordinates them. ConnecTradie verifies the lead\'s builder\'s licence; sub-trades are checked when assigned.",
  faqs: [
    {
      q: 'How much does a bathroom renovation cost in {{suburb}}?',
      a: 'A standard {{suburb}} bathroom renovation (5–6m², mid-range fittings, same layout) runs $22,000–$38,000. A refresh that keeps the layout and just updates tiles, vanity, and fixtures comes in cheaper at $12,000–$20,000. Premium work with stone, custom joinery, and luxury fittings scales to $80,000+.',
    },
    {
      q: 'How long does a bathroom renovation take?',
      a: 'A standard {{suburb}} bathroom renovation runs 3–5 weeks on site — demo (2 days), plumbing and electrical rough-in (3–4 days), waterproofing and cure (3 days), wall tiling (5–7 days), floor tiling (2–3 days), grout cure (2 days), fit-out (3–4 days). Add 6–10 weeks lead time for planning, design, and ordering fittings.',
    },
    {
      q: 'Do I need council approval for a bathroom reno?',
      a: 'Usually no for a like-for-like refresh in {{state}}. Yes if you\'re relocating drains significantly, changing the room\'s footprint, removing structural walls, or doing it in a heritage-listed property. Your {{suburb}} renovator should confirm whether approval is needed before quoting.',
    },
    {
      q: 'How are payments structured for a bathroom reno?',
      a: 'Bathroom renos run on milestone payments through ConnecTradie — typically demo + rough-in (30%), waterproofing + tiling (40%), completion (30%). Each milestone sits in Stripe escrow and only releases when you sign off that stage. If a milestone is in dispute the funds stay locked. No upfront deposit required.',
    },
    {
      q: 'Should I supply my own fittings?',
      a: 'You can — many {{suburb}} clients buy their own vanity, tapware, and tiles to avoid mark-up. Trade-supplied is usually 10–20% cheaper than retail though, and the warranty stack is cleaner. Get the quote both ways and decide. For tiles in particular, buy 10–15% extra to allow for waste and future repairs.',
    },
  ],
  howToChoose: [
    'Verify {{state}} builder\'s licence and home indemnity insurance certificate.',
    'Walk through 2–3 of their completed bathrooms in {{suburb}} before signing.',
    'Get the quote itemised — labour, materials, fittings, sub-trades, waste removal.',
    'Pin down the start AND completion dates with a liquidated-damages clause.',
    'Confirm the waterproofing certification (7-year minimum warranty in {{state}}).',
  ],
};

const FALLBACK_CONTENT: TradeContent = {
  intro:
    "Skilled {{tradeLabelPlural}} in {{suburb}}, all ABN-verified and paid through Stripe-held escrow — funds release only when you approve the work. Every tradie\'s licence and insurance is checked before they can submit a quote.",
  whatTheyDo: [
    'Quote on jobs in {{suburb}} and surrounding suburbs',
    'Work to a written, fixed-price scope where possible',
    'Operate under ABN with public liability insurance',
    'Hold any state contractor\'s licence required for the work',
    'Communicate via the platform — every message is recorded',
  ],
  costGuide: [
    { job: 'Hourly rate (typical)', low: 70, high: 130, unit: 'per hour', note: 'Varies by trade and {{suburb}} demand.' },
    { job: 'Call-out fee (typical)', low: 90, high: 180, unit: 'per visit' },
  ],
  licenseNote:
    "If this trade requires a state contractor\'s licence in {{state}}, every tradie listed here has had it verified before being allowed to quote. Where no licence is required, we verify ABN and public liability insurance instead.",
  faqs: [
    {
      q: 'How much does this trade cost in {{suburb}}?',
      a: 'Costs vary by job complexity and {{suburb}} demand. Most {{suburb}} tradies charge an hourly rate of $70–$130 with a call-out fee, or quote fixed-price for defined jobs. Always ask whether the quote is fixed-price or time-and-materials before work starts.',
    },
    {
      q: 'How does payment work?',
      a: 'When you accept a quote, the full amount sits in Stripe-held escrow — ConnecTradie never holds your funds. The tradie sees the payment is committed before starting work, so you never pay upfront. After completion, you release the funds with one click. If you don\'t respond, they auto-release 48 hours after the tradie marks the job complete.',
    },
    {
      q: 'What if the work isn\'t up to standard?',
      a: 'Don\'t release the funds. They sit in escrow until both parties agree the work meets the quoted scope. If there\'s a disagreement, ConnecTradie mediates between you and the tradie. The money never leaves escrow without your sign-off (or, if you go silent, the 48-hour auto-release).',
    },
    {
      q: 'How are tradies vetted?',
      a: 'Every tradie on ConnecTradie is ABN-verified before they can list, and licence-verified before they can quote on jobs in trades that require a state licence. Reviews are tied to completed, paid jobs only — no anonymous ratings, no inflated scores.',
    },
  ],
  howToChoose: [
    'Read the last 5 reviews looking for "showed up on time" and "stuck to the quote".',
    'Confirm whether the quote is fixed-price or hourly.',
    'Verify ABN and (if required for the trade) {{state}} contractor\'s licence.',
    'Ask about public liability insurance — accidents happen.',
    'Bundle multiple small jobs into one visit to save on call-out fees.',
  ],
};

const TRADE_CONTENT: Record<string, TradeContent> = {
  plumber: PLUMBER,
  electrician: ELECTRICIAN,
  carpenter: CARPENTER,
  builder: BUILDER,
  painter: PAINTER,
  cleaner: CLEANER,
  roofer: ROOFER,
  tiler: TILER,
  landscaper: LANDSCAPER,
  handyman: HANDYMAN,
  'air-conditioning': AIR_CONDITIONING,
  'bathroom-renovator': BATHROOM_RENOVATOR,
};

/**
 * Substitution context for trade content placeholders.
 * `{{suburb}}` and `{{state}}` get replaced at render time.
 */
export interface ContentContext {
  suburb: string;
  state: string;
  tradeLabel: string;
  tradeLabelPlural: string;
}

/** Replace `{{key}}` placeholders in a string using the context object. */
export function render(template: string, ctx: ContentContext): string {
  return template
    .replace(/\{\{suburb\}\}/g, ctx.suburb)
    .replace(/\{\{state\}\}/g, ctx.state)
    .replace(/\{\{tradeLabel\}\}/g, ctx.tradeLabel)
    .replace(/\{\{tradeLabelPlural\}\}/g, ctx.tradeLabelPlural);
}

/**
 * Get rendered content for a trade × suburb. Falls back to FALLBACK_CONTENT
 * for trades not yet hand-written (still substantively unique per suburb).
 */
export function getTradeContent(tradeSlug: string, ctx: ContentContext): TradeContent {
  const raw = TRADE_CONTENT[tradeSlug] ?? FALLBACK_CONTENT;
  return {
    intro: render(raw.intro, ctx),
    whatTheyDo: raw.whatTheyDo.map((s) => render(s, ctx)),
    costGuide: raw.costGuide.map((row) => ({
      ...row,
      job: render(row.job, ctx),
      note: row.note ? render(row.note, ctx) : undefined,
    })),
    licenseNote: render(raw.licenseNote, ctx),
    faqs: raw.faqs.map((f) => ({ q: render(f.q, ctx), a: render(f.a, ctx) })),
    howToChoose: raw.howToChoose.map((s) => render(s, ctx)),
  };
}

/** True if we have hand-written content for this trade (vs falling back). */
export function hasFullContent(tradeSlug: string): boolean {
  return tradeSlug in TRADE_CONTENT;
}
