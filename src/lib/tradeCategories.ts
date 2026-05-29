/**
 * Centralized trade category definitions.
 * Import from here instead of hardcoding category arrays in pages/components.
 * For React components that need reactivity, use the useTradeCategories() hook instead.
 */

export interface TradeCategory {
  value: string;
  label: string;
  icon?: string;
  subcategories?: string[];
  /**
   * True when this trade legally requires a state-issued contractor's licence
   * in Australia. Drives the quote-submission verification gate: tradies must
   * have license_verified=true AND have this trade in verified_trades[].
   */
  requiresLicense?: boolean;
}

export const TRADE_CATEGORIES: TradeCategory[] = [
  { value: 'plumber', label: 'Plumber', requiresLicense: true, subcategories: ['Hot water', 'Blocked drains', 'Gas fitting', 'Bathroom renovation', 'Leak repair', 'Backflow testing', 'Septic pump-out'] },
  { value: 'electrician', label: 'Electrician', requiresLicense: true, subcategories: ['Rewiring', 'Lighting', 'Switchboard', 'Solar', 'EV charger', 'Safety inspection', 'Smoke alarm testing', 'RCD testing'] },
  { value: 'carpenter', label: 'Carpenter', subcategories: ['Decking', 'Framing', 'Pergolas', 'Cabinetry', 'Doors & windows', 'Timber maintenance'] },
  { value: 'builder', label: 'Builder', requiresLicense: true, subcategories: ['New homes', 'Extensions', 'Renovations', 'Granny flats', 'Commercial'] },
  { value: 'painter', label: 'Painter', subcategories: ['Interior', 'Exterior', 'Commercial', 'Wallpaper', 'Spray painting', 'Touch-up service'] },
  { value: 'landscaper', label: 'Landscaper', subcategories: ['Garden design', 'Retaining walls', 'Paving', 'Irrigation', 'Turf', 'Garden maintenance', 'Hedge trimming', 'Mulching & weeding'] },
  { value: 'handyman', label: 'Handyman', subcategories: ['General repairs', 'Furniture assembly', 'Shelving', 'Odd jobs', 'Property maintenance'] },
  { value: 'cleaner', label: 'Cleaner', subcategories: ['End of lease', 'Deep clean', 'Regular house clean', 'Office clean', 'Window cleaning', 'Carpet cleaning', 'Commercial clean', 'Strata common areas', 'Oven & BBQ clean'] },
  { value: 'roofer', label: 'Roofer', requiresLicense: true, subcategories: ['Roof repair', 'Re-roofing', 'Guttering', 'Skylights', 'Roof painting', 'Gutter cleaning', 'Roof inspection'] },
  { value: 'tiler', label: 'Tiler', subcategories: ['Bathroom tiling', 'Floor tiling', 'Splashbacks', 'Waterproofing', 'Pool tiling', 'Grout & reseal'] },
  { value: 'concreter', label: 'Concreter', subcategories: ['Driveways', 'Slabs', 'Paths', 'Polished concrete', 'Exposed aggregate', 'Concrete sealing'] },
  { value: 'fencer', label: 'Fencer', subcategories: ['Timber fencing', 'Colorbond', 'Pool fencing', 'Gates', 'Retaining walls', 'Fence staining'] },
  { value: 'glazier', label: 'Glazier', subcategories: ['Window repair', 'Shower screens', 'Mirrors', 'Double glazing', 'Splashbacks'] },
  { value: 'locksmith', label: 'Locksmith', subcategories: ['Lock change', 'Emergency lockout', 'Key cutting', 'Security upgrade'] },
  { value: 'pest-control', label: 'Pest Control', requiresLicense: true, subcategories: ['Termite inspection', 'Cockroaches', 'Rodents', 'Spiders', 'Ants', 'General pest treatment', 'Termite barrier'] },
  { value: 'air-conditioning', label: 'Air Conditioning', requiresLicense: true, subcategories: ['Split system', 'Ducted', 'Repair', 'Service', 'Installation', 'Regular aircon service', 'Filter clean & gas top-up'] },
  { value: 'garage-doors', label: 'Garage Doors', subcategories: ['Installation', 'Repair', 'Automation', 'Roller doors', 'Panel doors', 'Annual service'] },
  { value: 'demolition', label: 'Demolition', requiresLicense: true, subcategories: ['House demolition', 'Asbestos removal', 'Strip outs', 'Site clearing'] },
  { value: 'bricklayer', label: 'Bricklayer', requiresLicense: true, subcategories: ['Brick walls', 'Retaining walls', 'Letterboxes', 'BBQ areas', 'Repair'] },
  { value: 'plasterer', label: 'Plasterer', subcategories: ['Plaster repair', 'Cornices', 'Rendering', 'Feature walls', 'Ceiling repair'] },
  { value: 'flooring', label: 'Flooring', subcategories: ['Timber', 'Laminate', 'Vinyl', 'Polished concrete', 'Carpet', 'Floor polishing & reseal'] },
  { value: 'cabinet-maker', label: 'Cabinet Maker', subcategories: ['Kitchen cabinets', 'Wardrobes', 'Vanities', 'Laundry', 'Custom'] },
  { value: 'welder', label: 'Welder', subcategories: ['Steel fabrication', 'Balustrades', 'Gates', 'Structural steel', 'Repairs'] },
  { value: 'insulation', label: 'Insulation', subcategories: ['Ceiling batts', 'Wall insulation', 'Underfloor', 'Acoustic', 'Spray foam'] },
  { value: 'arborist', label: 'Arborist', requiresLicense: true, subcategories: ['Tree removal', 'Tree pruning', 'Stump grinding', 'Palm cleaning', 'Reports', 'Regular tree maintenance'] },
  { value: 'pool-builder', label: 'Pool Builder', requiresLicense: true, subcategories: ['New pool', 'Renovation', 'Equipment', 'Fencing', 'Pool maintenance', 'Chemical balancing', 'Filter & pump service'] },
  { value: 'antenna-technician', label: 'Antenna Technician', subcategories: ['TV antenna', 'Satellite', 'Data cabling', 'CCTV', 'Intercom'] },
  { value: 'waterproofing', label: 'Waterproofing', requiresLicense: true, subcategories: ['Bathroom', 'Balcony', 'Basement', 'Roof', 'Retaining wall', 'Membrane inspection'] },
  { value: 'scaffolder', label: 'Scaffolder', requiresLicense: true, subcategories: ['Residential', 'Commercial', 'Industrial', 'Event', 'Hire'] },
  { value: 'earthmoving', label: 'Earthmoving', subcategories: ['Excavation', 'Bobcat', 'Tipper', 'Site prep', 'Drainage'] },
  { value: 'stonemasonry', label: 'Stonemasonry', subcategories: ['Natural stone', 'Cladding', 'Restoration', 'Fireplaces', 'Steps'] },
  { value: 'solar', label: 'Solar', requiresLicense: true, subcategories: ['Panel installation', 'Battery storage', 'Maintenance', 'Commercial', 'Panel cleaning & inspection'] },
  { value: 'security', label: 'Security Systems', requiresLicense: true, subcategories: ['Alarm systems', 'CCTV', 'Access control', 'Intercoms', 'Smart home', 'Annual alarm testing'] },
  { value: 'curtains-blinds', label: 'Curtains & Blinds', subcategories: ['Roller blinds', 'Curtains', 'Shutters', 'Awnings', 'Motorised'] },
  { value: 'lawn-mowing', label: 'Lawn Mowing', subcategories: ['Regular mowing', 'Edging', 'Hedging', 'Green waste', 'Mulching', 'Garden tidy-up'] },
  { value: 'removalist', label: 'Removalist', subcategories: ['House move', 'Office move', 'Piano', 'Interstate', 'Storage'] },
  { value: 'bathroom-renovator', label: 'Bathroom Renovator', requiresLicense: true, subcategories: ['Full renovation', 'Partial', 'Accessible', 'Ensuite', 'Laundry'] },
  { value: 'kitchen-renovator', label: 'Kitchen Renovator', requiresLicense: true, subcategories: ['Full renovation', 'Benchtops', 'Cabinets', 'Splashback', 'Appliances'] },
  { value: 'hvac', label: 'HVAC', requiresLicense: true, subcategories: ['Heating', 'Ventilation', 'Ducted', 'Evaporative', 'Commercial', 'Regular HVAC service', 'Filter replacement'] },
  { value: 'fire-safety', label: 'Fire Safety', requiresLicense: true, subcategories: ['Smoke alarm testing', 'Fire extinguisher service', 'Exit light inspection', 'Fire door inspection', 'Evacuation plan'] },
  { value: 'appliance-service', label: 'Appliance Service', subcategories: ['Oven clean & service', 'Dishwasher service', 'Dryer vent clean', 'Washing machine service', 'Fridge service'] },
  { value: 'hot-water-service', label: 'Hot Water Service', requiresLicense: true, subcategories: ['System flush', 'Anode rod check', 'Temperature & pressure valve', 'Tank replacement', 'Heat pump service'] },
  { value: 'chimney-sweep', label: 'Chimney Sweep', subcategories: ['Chimney clean', 'Flue inspection', 'Fireplace service', 'Cowl fitting'] },
  { value: 'other', label: 'Other', subcategories: [] },
];

/**
 * Returns true when the given trade legally requires a state-issued
 * contractor's licence in Australia (drives the verification gate).
 * Falls back to false for unknown trades (handyman-style work permitted).
 */
export function tradeRequiresLicense(value: string | null | undefined): boolean {
  if (!value) return false;
  const cat = TRADE_CATEGORIES.find(c => c.value === value);
  return !!cat?.requiresLicense;
}

/** Category values only (for filters) */
export const TRADE_CATEGORY_VALUES = TRADE_CATEGORIES.map(c => c.value);

/** Category labels only (for display) */
export const TRADE_CATEGORY_LABELS = TRADE_CATEGORIES.map(c => c.label);

/** Lookup map: value -> label */
export const TRADE_CATEGORY_MAP = Object.fromEntries(
  TRADE_CATEGORIES.map(c => [c.value, c.label])
);

/** Get label from value */
export function getTradeCategoryLabel(value: string): string {
  return TRADE_CATEGORY_MAP[value] || value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Simplified trade options for search/hero dropdowns (value + label only) */
export const TRADE_OPTIONS: { value: string; label: string }[] = TRADE_CATEGORIES.map(({ value, label }) => ({ value, label }));

/** Construction trades for onboarding */
export const CONSTRUCTION_CATEGORIES = [
  'Plumber', 'Electrician', 'Carpenter', 'Builder', 'Painter',
  'Landscaper', 'Handyman', 'Cleaner', 'Roofer', 'Tiler',
  'Concreter', 'Fencer', 'Glazier', 'Locksmith', 'Pest Control',
  'Air Conditioning', 'Garage Doors', 'Demolition', 'Bricklayer', 'Plasterer',
  'Flooring', 'Cabinet Maker', 'Welder', 'Insulation', 'Arborist',
  'Pool Builder', 'Antenna Technician', 'Waterproofing', 'Scaffolder', 'Earthmoving',
  'Stonemasonry', 'Solar', 'Security Systems', 'Curtains & Blinds', 'Lawn Mowing',
  'Removalist', 'Bathroom Renovator', 'Kitchen Renovator', 'HVAC',
  'Fire Safety', 'Appliance Service', 'Hot Water Service', 'Chimney Sweep',
];

/** Hospitality trades for onboarding */
export const HOSPITALITY_CATEGORIES = [
  'Private Chef', 'Event Catering', 'Mobile Bar/Bartender',
];

/**
 * Suggested supplies by trade category for ongoing services.
 * Used as autocomplete/suggestions when adding supply items.
 */
/** Default units for suggested supply items */
export const SUPPLY_DEFAULT_UNITS: Record<string, string> = {
  'Toilet paper rolls': 'rolls',
  'Hand paper towel rolls': 'rolls',
  'Bin liners (large)': 'packs',
  'Bin liners (small)': 'packs',
  'Surface spray': 'bottles',
  'Glass cleaner': 'bottles',
  'Toilet cleaner': 'bottles',
  'Disinfectant wipes': 'packs',
  'Microfibre cloths': 'packs',
  'Mop heads': 'units',
  'Sponges/scourers': 'packs',
  'Hand soap refill': 'bottles',
  'Paper towels': 'rolls',
  'Dishwashing liquid': 'bottles',
  'Floor cleaner': 'bottles',
  'Bathroom cleaner': 'bottles',
  'Bleach': 'bottles',
  'Rubber gloves': 'pairs',
  'Vacuum bags/filters': 'packs',
  'Air freshener': 'cans',
  'Mulch (cubic metre)': 'm³',
  'Fertiliser': 'bags',
  'Weed killer': 'bottles',
  'Lawn seed': 'bags',
  'Turf rolls': 'rolls',
  'Line trimmer cord': 'metres',
  'Fuel (unleaded)': 'litres',
  'Fuel (2-stroke mix)': 'litres',
  'Teflon tape': 'rolls',
  'Silicone sealant': 'tubes',
  'Pipe cement': 'tins',
  'Cable ties': 'packs',
  'Electrical tape': 'rolls',
  'Light globes (LED)': 'units',
  'Paint rollers': 'units',
  'Roller sleeves': 'units',
  'Sandpaper (assorted)': 'sheets',
  'Drop sheets': 'units',
  'Chlorine': 'kg',
  'Pool salt': 'bags',
  'Test strips': 'packs',
  'Smoke alarm batteries': 'units',
  'Smoke alarms (photoelectric)': 'units',
  'Fire extinguisher refill': 'units',
  'AC filters': 'units',
  'HVAC filters': 'units',
};

export const SUPPLY_SUGGESTIONS: Record<string, string[]> = {
  cleaner: [
    'Toilet paper rolls',
    'Hand paper towel rolls',
    'Bin liners (large)',
    'Bin liners (small)',
  ],
  landscaper: [
    'Mulch (cubic metre)', 'Fertiliser', 'Weed killer', 'Garden bags',
    'Plant ties', 'Potting mix', 'Seedlings', 'Irrigation drippers',
    'Lawn seed', 'Turf rolls', 'Hedge trimmer blades', 'Line trimmer cord',
    'Fuel (2-stroke mix)', 'Chainsaw oil', 'Soil wetter', 'Ant killer granules',
  ],
  'lawn-mowing': [
    'Fuel (unleaded)', 'Fuel (2-stroke mix)', 'Line trimmer cord',
    'Mower blades', 'Lawn fertiliser', 'Weed killer', 'Garden bags',
    'Hedge trimmer oil', 'Edger blades', 'Ear plugs',
  ],
  plumber: [
    'Teflon tape', 'Silicone sealant', 'Pipe cement', 'Washers (assorted)',
    'O-rings', 'Flux paste', 'Solder', 'PVC pipe fittings',
    'Copper pipe fittings', 'Tap cartridges', 'Drain cleaner',
  ],
  electrician: [
    'Cable ties', 'Electrical tape', 'RCD units', 'Smoke alarm batteries',
    'Light globes (LED)', 'Conduit clips', 'Switch plates', 'GPO sockets',
    'Wire connectors', 'Silicone sealant',
  ],
  painter: [
    'Paint rollers', 'Roller sleeves', 'Painter\'s tape', 'Drop sheets',
    'Sandpaper (assorted)', 'Sugar soap', 'Gap filler', 'Caulk', 'Brushes',
    'Paint thinners', 'Primer', 'Putty',
  ],
  handyman: [
    'Screws (assorted)', 'Wall plugs', 'Silicone sealant', 'Gap filler',
    'Sandpaper', 'Wood glue', 'Lubricant spray', 'Painter\'s tape',
    'Cable ties', 'Batteries (assorted)', 'Light globes',
  ],
  'air-conditioning': [
    'AC filters', 'Refrigerant gas', 'Condensate pump cleaner',
    'Coil cleaner', 'Drain tablets', 'Cable ties', 'Insulation tape',
  ],
  'pool-builder': [
    'Chlorine', 'Pool acid', 'Pool salt', 'Stabiliser', 'Algaecide',
    'Filter sand', 'Filter cartridge', 'Test strips', 'O-rings',
    'Skimmer basket', 'Pool brush head',
  ],
  'pest-control': [
    'Bait stations', 'Rodent bait', 'Spray chemical', 'Termite monitors',
    'Dust insecticide', 'Surface spray', 'Glue boards', 'PPE masks',
  ],
  'fire-safety': [
    'Smoke alarm batteries', 'Smoke alarms (photoelectric)', 'Fire extinguisher refill',
    'Exit light batteries', 'Test tags', 'Fire blankets',
  ],
  'appliance-service': [
    'Oven cleaner', 'Dishwasher salt', 'Dryer lint filters', 'Washing machine cleaner',
    'Descaler', 'Door seals', 'Heating elements',
  ],
  hvac: [
    'HVAC filters', 'Refrigerant gas', 'Fan belt', 'Coil cleaner',
    'Drain tablets', 'Thermostat batteries',
  ],
  // Generic suggestions for trades without specific lists
  _default: [
    'Cleaning supplies', 'Safety equipment (PPE)', 'Consumable materials',
    'Replacement parts', 'Adhesives/sealants', 'Fasteners (screws/bolts)',
    'Lubricant', 'Rags/cloths', 'Tape (assorted)',
  ],
};

// Map labels/variants to canonical supply suggestion keys
const SUPPLY_KEY_ALIASES: Record<string, string> = {
  cleaning: 'cleaner', cleaning_weekly: 'cleaner', 'office-clean': 'cleaner', 'office_clean': 'cleaner',
  landscape: 'landscaper', gardening: 'landscaper', garden: 'landscaper',
  'lawn-mowing': 'lawn-mowing', lawn_mowing: 'lawn-mowing', mowing: 'lawn-mowing',
  plumbing: 'plumber', electrical: 'electrician', painting: 'painter',
  'air-conditioning': 'air-conditioning', air_conditioning: 'air-conditioning', aircon: 'air-conditioning',
  'pest-control': 'pest-control', pest_control: 'pest-control',
  'pool-builder': 'pool-builder', pool: 'pool-builder', pool_maintenance: 'pool-builder',
  'fire-safety': 'fire-safety', fire_safety: 'fire-safety',
  'appliance-service': 'appliance-service', appliance_service: 'appliance-service',
};

/** Get supply suggestions for a trade category */
export function getSupplySuggestions(tradeCategory: string): string[] {
  const raw = tradeCategory.toLowerCase().replace(/\s+/g, '-');
  // Try direct match, then alias, then strip trailing modifiers (e.g. "cleaning-weekly" → "cleaning")
  const key = SUPPLY_SUGGESTIONS[raw] ? raw
    : SUPPLY_KEY_ALIASES[raw] ?? SUPPLY_KEY_ALIASES[raw.replace(/-/g, '_')]
      ?? SUPPLY_KEY_ALIASES[raw.split(/[-_]/)[0]]
      ?? raw;
  return SUPPLY_SUGGESTIONS[key] ?? SUPPLY_SUGGESTIONS._default;
}
