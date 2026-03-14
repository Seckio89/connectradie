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
}

export const TRADE_CATEGORIES: TradeCategory[] = [
  { value: 'plumber', label: 'Plumber', subcategories: ['Hot water', 'Blocked drains', 'Gas fitting', 'Bathroom renovation', 'Leak repair', 'Backflow testing', 'Septic pump-out'] },
  { value: 'electrician', label: 'Electrician', subcategories: ['Rewiring', 'Lighting', 'Switchboard', 'Solar', 'EV charger', 'Safety inspection', 'Smoke alarm testing', 'RCD testing'] },
  { value: 'carpenter', label: 'Carpenter', subcategories: ['Decking', 'Framing', 'Pergolas', 'Cabinetry', 'Doors & windows', 'Timber maintenance'] },
  { value: 'builder', label: 'Builder', subcategories: ['New homes', 'Extensions', 'Renovations', 'Granny flats', 'Commercial'] },
  { value: 'painter', label: 'Painter', subcategories: ['Interior', 'Exterior', 'Commercial', 'Wallpaper', 'Spray painting', 'Touch-up service'] },
  { value: 'landscaper', label: 'Landscaper', subcategories: ['Garden design', 'Retaining walls', 'Paving', 'Irrigation', 'Turf', 'Garden maintenance', 'Hedge trimming', 'Mulching & weeding'] },
  { value: 'handyman', label: 'Handyman', subcategories: ['General repairs', 'Furniture assembly', 'Shelving', 'Odd jobs', 'Property maintenance'] },
  { value: 'cleaner', label: 'Cleaner', subcategories: ['End of lease', 'Deep clean', 'Regular house clean', 'Office clean', 'Window cleaning', 'Carpet cleaning', 'Commercial clean', 'Strata common areas', 'Oven & BBQ clean'] },
  { value: 'roofer', label: 'Roofer', subcategories: ['Roof repair', 'Re-roofing', 'Guttering', 'Skylights', 'Roof painting', 'Gutter cleaning', 'Roof inspection'] },
  { value: 'tiler', label: 'Tiler', subcategories: ['Bathroom tiling', 'Floor tiling', 'Splashbacks', 'Waterproofing', 'Pool tiling', 'Grout & reseal'] },
  { value: 'concreter', label: 'Concreter', subcategories: ['Driveways', 'Slabs', 'Paths', 'Polished concrete', 'Exposed aggregate', 'Concrete sealing'] },
  { value: 'fencer', label: 'Fencer', subcategories: ['Timber fencing', 'Colorbond', 'Pool fencing', 'Gates', 'Retaining walls', 'Fence staining'] },
  { value: 'glazier', label: 'Glazier', subcategories: ['Window repair', 'Shower screens', 'Mirrors', 'Double glazing', 'Splashbacks'] },
  { value: 'locksmith', label: 'Locksmith', subcategories: ['Lock change', 'Emergency lockout', 'Key cutting', 'Security upgrade'] },
  { value: 'pest-control', label: 'Pest Control', subcategories: ['Termite inspection', 'Cockroaches', 'Rodents', 'Spiders', 'Ants', 'General pest treatment', 'Termite barrier'] },
  { value: 'air-conditioning', label: 'Air Conditioning', subcategories: ['Split system', 'Ducted', 'Repair', 'Service', 'Installation', 'Regular aircon service', 'Filter clean & gas top-up'] },
  { value: 'garage-doors', label: 'Garage Doors', subcategories: ['Installation', 'Repair', 'Automation', 'Roller doors', 'Panel doors', 'Annual service'] },
  { value: 'demolition', label: 'Demolition', subcategories: ['House demolition', 'Asbestos removal', 'Strip outs', 'Site clearing'] },
  { value: 'bricklayer', label: 'Bricklayer', subcategories: ['Brick walls', 'Retaining walls', 'Letterboxes', 'BBQ areas', 'Repair'] },
  { value: 'plasterer', label: 'Plasterer', subcategories: ['Plaster repair', 'Cornices', 'Rendering', 'Feature walls', 'Ceiling repair'] },
  { value: 'flooring', label: 'Flooring', subcategories: ['Timber', 'Laminate', 'Vinyl', 'Polished concrete', 'Carpet', 'Floor polishing & reseal'] },
  { value: 'cabinet-maker', label: 'Cabinet Maker', subcategories: ['Kitchen cabinets', 'Wardrobes', 'Vanities', 'Laundry', 'Custom'] },
  { value: 'welder', label: 'Welder', subcategories: ['Steel fabrication', 'Balustrades', 'Gates', 'Structural steel', 'Repairs'] },
  { value: 'insulation', label: 'Insulation', subcategories: ['Ceiling batts', 'Wall insulation', 'Underfloor', 'Acoustic', 'Spray foam'] },
  { value: 'arborist', label: 'Arborist', subcategories: ['Tree removal', 'Tree pruning', 'Stump grinding', 'Palm cleaning', 'Reports', 'Regular tree maintenance'] },
  { value: 'pool-builder', label: 'Pool Builder', subcategories: ['New pool', 'Renovation', 'Equipment', 'Fencing', 'Pool maintenance', 'Chemical balancing', 'Filter & pump service'] },
  { value: 'antenna-technician', label: 'Antenna Technician', subcategories: ['TV antenna', 'Satellite', 'Data cabling', 'CCTV', 'Intercom'] },
  { value: 'waterproofing', label: 'Waterproofing', subcategories: ['Bathroom', 'Balcony', 'Basement', 'Roof', 'Retaining wall', 'Membrane inspection'] },
  { value: 'scaffolder', label: 'Scaffolder', subcategories: ['Residential', 'Commercial', 'Industrial', 'Event', 'Hire'] },
  { value: 'earthmoving', label: 'Earthmoving', subcategories: ['Excavation', 'Bobcat', 'Tipper', 'Site prep', 'Drainage'] },
  { value: 'stonemasonry', label: 'Stonemasonry', subcategories: ['Natural stone', 'Cladding', 'Restoration', 'Fireplaces', 'Steps'] },
  { value: 'solar', label: 'Solar', subcategories: ['Panel installation', 'Battery storage', 'Maintenance', 'Commercial', 'Panel cleaning & inspection'] },
  { value: 'security', label: 'Security Systems', subcategories: ['Alarm systems', 'CCTV', 'Access control', 'Intercoms', 'Smart home', 'Annual alarm testing'] },
  { value: 'curtains-blinds', label: 'Curtains & Blinds', subcategories: ['Roller blinds', 'Curtains', 'Shutters', 'Awnings', 'Motorised'] },
  { value: 'lawn-mowing', label: 'Lawn Mowing', subcategories: ['Regular mowing', 'Edging', 'Hedging', 'Green waste', 'Mulching', 'Garden tidy-up'] },
  { value: 'removalist', label: 'Removalist', subcategories: ['House move', 'Office move', 'Piano', 'Interstate', 'Storage'] },
  { value: 'bathroom-renovator', label: 'Bathroom Renovator', subcategories: ['Full renovation', 'Partial', 'Accessible', 'Ensuite', 'Laundry'] },
  { value: 'kitchen-renovator', label: 'Kitchen Renovator', subcategories: ['Full renovation', 'Benchtops', 'Cabinets', 'Splashback', 'Appliances'] },
  { value: 'hvac', label: 'HVAC', subcategories: ['Heating', 'Ventilation', 'Ducted', 'Evaporative', 'Commercial', 'Regular HVAC service', 'Filter replacement'] },
  { value: 'fire-safety', label: 'Fire Safety', subcategories: ['Smoke alarm testing', 'Fire extinguisher service', 'Exit light inspection', 'Fire door inspection', 'Evacuation plan'] },
  { value: 'appliance-service', label: 'Appliance Service', subcategories: ['Oven clean & service', 'Dishwasher service', 'Dryer vent clean', 'Washing machine service', 'Fridge service'] },
  { value: 'hot-water-service', label: 'Hot Water Service', subcategories: ['System flush', 'Anode rod check', 'Temperature & pressure valve', 'Tank replacement', 'Heat pump service'] },
  { value: 'chimney-sweep', label: 'Chimney Sweep', subcategories: ['Chimney clean', 'Flue inspection', 'Fireplace service', 'Cowl fitting'] },
  { value: 'other', label: 'Other', subcategories: [] },
];

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
