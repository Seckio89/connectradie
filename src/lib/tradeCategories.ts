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
  { value: 'plumber', label: 'Plumber', subcategories: ['Hot water', 'Blocked drains', 'Gas fitting', 'Bathroom renovation', 'Leak repair'] },
  { value: 'electrician', label: 'Electrician', subcategories: ['Rewiring', 'Lighting', 'Switchboard', 'Solar', 'EV charger'] },
  { value: 'carpenter', label: 'Carpenter', subcategories: ['Decking', 'Framing', 'Pergolas', 'Cabinetry', 'Doors & windows'] },
  { value: 'builder', label: 'Builder', subcategories: ['New homes', 'Extensions', 'Renovations', 'Granny flats', 'Commercial'] },
  { value: 'painter', label: 'Painter', subcategories: ['Interior', 'Exterior', 'Commercial', 'Wallpaper', 'Spray painting'] },
  { value: 'landscaper', label: 'Landscaper', subcategories: ['Garden design', 'Retaining walls', 'Paving', 'Irrigation', 'Turf'] },
  { value: 'handyman', label: 'Handyman', subcategories: ['General repairs', 'Furniture assembly', 'Shelving', 'Odd jobs'] },
  { value: 'cleaner', label: 'Cleaner', subcategories: ['End of lease', 'Deep clean', 'Office', 'Window cleaning', 'Carpet cleaning'] },
  { value: 'roofer', label: 'Roofer', subcategories: ['Roof repair', 'Re-roofing', 'Guttering', 'Skylights', 'Roof painting'] },
  { value: 'tiler', label: 'Tiler', subcategories: ['Bathroom tiling', 'Floor tiling', 'Splashbacks', 'Waterproofing', 'Pool tiling'] },
  { value: 'concreter', label: 'Concreter', subcategories: ['Driveways', 'Slabs', 'Paths', 'Polished concrete', 'Exposed aggregate'] },
  { value: 'fencer', label: 'Fencer', subcategories: ['Timber fencing', 'Colorbond', 'Pool fencing', 'Gates', 'Retaining walls'] },
  { value: 'glazier', label: 'Glazier', subcategories: ['Window repair', 'Shower screens', 'Mirrors', 'Double glazing', 'Splashbacks'] },
  { value: 'locksmith', label: 'Locksmith', subcategories: ['Lock change', 'Emergency lockout', 'Key cutting', 'Security upgrade'] },
  { value: 'pest-control', label: 'Pest Control', subcategories: ['Termite inspection', 'Cockroaches', 'Rodents', 'Spiders', 'Ants'] },
  { value: 'air-conditioning', label: 'Air Conditioning', subcategories: ['Split system', 'Ducted', 'Repair', 'Service', 'Installation'] },
  { value: 'garage-doors', label: 'Garage Doors', subcategories: ['Installation', 'Repair', 'Automation', 'Roller doors', 'Panel doors'] },
  { value: 'demolition', label: 'Demolition', subcategories: ['House demolition', 'Asbestos removal', 'Strip outs', 'Site clearing'] },
  { value: 'bricklayer', label: 'Bricklayer', subcategories: ['Brick walls', 'Retaining walls', 'Letterboxes', 'BBQ areas', 'Repair'] },
  { value: 'plasterer', label: 'Plasterer', subcategories: ['Plaster repair', 'Cornices', 'Rendering', 'Feature walls', 'Ceiling repair'] },
  { value: 'flooring', label: 'Flooring', subcategories: ['Timber', 'Laminate', 'Vinyl', 'Polished concrete', 'Carpet'] },
  { value: 'cabinet-maker', label: 'Cabinet Maker', subcategories: ['Kitchen cabinets', 'Wardrobes', 'Vanities', 'Laundry', 'Custom'] },
  { value: 'welder', label: 'Welder', subcategories: ['Steel fabrication', 'Balustrades', 'Gates', 'Structural steel', 'Repairs'] },
  { value: 'insulation', label: 'Insulation', subcategories: ['Ceiling batts', 'Wall insulation', 'Underfloor', 'Acoustic', 'Spray foam'] },
  { value: 'arborist', label: 'Arborist', subcategories: ['Tree removal', 'Tree pruning', 'Stump grinding', 'Palm cleaning', 'Reports'] },
  { value: 'pool-builder', label: 'Pool Builder', subcategories: ['New pool', 'Renovation', 'Equipment', 'Fencing', 'Maintenance'] },
  { value: 'antenna-technician', label: 'Antenna Technician', subcategories: ['TV antenna', 'Satellite', 'Data cabling', 'CCTV', 'Intercom'] },
  { value: 'waterproofing', label: 'Waterproofing', subcategories: ['Bathroom', 'Balcony', 'Basement', 'Roof', 'Retaining wall'] },
  { value: 'scaffolder', label: 'Scaffolder', subcategories: ['Residential', 'Commercial', 'Industrial', 'Event', 'Hire'] },
  { value: 'earthmoving', label: 'Earthmoving', subcategories: ['Excavation', 'Bobcat', 'Tipper', 'Site prep', 'Drainage'] },
  { value: 'stonemasonry', label: 'Stonemasonry', subcategories: ['Natural stone', 'Cladding', 'Restoration', 'Fireplaces', 'Steps'] },
  { value: 'solar', label: 'Solar', subcategories: ['Panel installation', 'Battery storage', 'Maintenance', 'Commercial', 'Inspection'] },
  { value: 'security', label: 'Security Systems', subcategories: ['Alarm systems', 'CCTV', 'Access control', 'Intercoms', 'Smart home'] },
  { value: 'curtains-blinds', label: 'Curtains & Blinds', subcategories: ['Roller blinds', 'Curtains', 'Shutters', 'Awnings', 'Motorised'] },
  { value: 'lawn-mowing', label: 'Lawn Mowing', subcategories: ['Regular mowing', 'Edging', 'Hedging', 'Green waste', 'Mulching'] },
  { value: 'removalist', label: 'Removalist', subcategories: ['House move', 'Office move', 'Piano', 'Interstate', 'Storage'] },
  { value: 'bathroom-renovator', label: 'Bathroom Renovator', subcategories: ['Full renovation', 'Partial', 'Accessible', 'Ensuite', 'Laundry'] },
  { value: 'kitchen-renovator', label: 'Kitchen Renovator', subcategories: ['Full renovation', 'Benchtops', 'Cabinets', 'Splashback', 'Appliances'] },
  { value: 'hvac', label: 'HVAC', subcategories: ['Heating', 'Ventilation', 'Ducted', 'Evaporative', 'Commercial'] },
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
