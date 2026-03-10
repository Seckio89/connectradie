/**
 * Australian state-based trade licensing requirements.
 *
 * Three tiers:
 *   1. SPECIALIST (always licensed) — Electrical, Plumbing, Gas Fitting,
 *      Air Conditioning & Refrigeration. License required regardless of
 *      contract value in every state.
 *
 *   2. GENERAL BUILDING (threshold-based) — Carpentry, Tiling, Roofing,
 *      General Builder, Painting. License required only when the contract
 *      value exceeds a state-specific threshold.
 *
 *   3. EXEMPT (no license) — Handyman, Cleaning, Gardening/Landscaping,
 *      Lawn Mowing, Removalist, Rubbish Removal, Window Cleaner,
 *      Gutter Cleaner, Interior Decorator. No building/contractor license
 *      required regardless of contract value (ABN + insurance still
 *      recommended for platform trust).
 *
 * WA exception: Only Electrical, Plumbing, Gas Fitting, and Painting
 * require a license. All other trades (including general building) are
 * exempt in WA.
 *
 * Sources:
 *   NSW – Home Building Act 1989, threshold $5,000
 *   VIC – Domestic Building Contracts Act, threshold $10,000
 *   QLD – QBCC Act 1991, threshold $3,300 incl. GST
 *   WA  – Building Services (Registration) Act 2011
 *   SA  – Building Work Contractors Act 1995, threshold $12,000
 *   TAS – Building Act 2016, threshold $20,000
 *   ACT – Construction Occupations (Licensing) Act 2004, threshold $12,000
 *   NT  – Building Act 1993, threshold $12,000
 */

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export const AUSTRALIAN_STATES: { value: AustralianState; label: string }[] = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'WA',  label: 'Western Australia' },
  { value: 'SA',  label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NT',  label: 'Northern Territory' },
];

// ── Canonical trade list ────────────────────────────────────────────
//
// Single source of truth for the whole app.
//   `value`  — lowercase, matches what's stored in profiles.declared_trades
//   `label`  — display name, also matches the licensing Sets below

export const ALL_TRADES: { value: string; label: string }[] = [
  // Specialist (always licensed)
  { value: 'plumber',            label: 'Plumbing' },
  { value: 'electrician',        label: 'Electrical' },
  { value: 'gas-fitting',        label: 'Gas Fitting' },
  { value: 'air-conditioning',   label: 'Air Conditioning & Refrigeration' },
  // General building (threshold-based)
  { value: 'carpenter',          label: 'Carpentry' },
  { value: 'tiler',              label: 'Tiling' },
  { value: 'roofer',             label: 'Roofing' },
  { value: 'builder',            label: 'General Builder' },
  { value: 'painter',            label: 'Painting' },
  { value: 'concreter',          label: 'Concreting' },
  { value: 'bricklayer',         label: 'Bricklaying' },
  { value: 'plasterer',          label: 'Plastering' },
  { value: 'renderer',           label: 'Rendering' },
  { value: 'flooring',           label: 'Flooring' },
  { value: 'cabinet-maker',      label: 'Cabinet Making' },
  { value: 'glazier',            label: 'Glazier' },
  { value: 'fencer',             label: 'Fencing' },
  { value: 'locksmith',          label: 'Locksmith' },
  { value: 'solar',              label: 'Solar Installer' },
  { value: 'pool',               label: 'Pool Builder/Technician' },
  { value: 'pest-control',       label: 'Pest Control' },
  { value: 'demolition',         label: 'Demolition' },
  { value: 'excavation',         label: 'Excavation' },
  { value: 'scaffolding',        label: 'Scaffolding' },
  { value: 'waterproofing',      label: 'Waterproofing' },
  { value: 'insulation',         label: 'Insulation' },
  { value: 'garage-doors',       label: 'Garage Doors' },
  { value: 'security',           label: 'Security Systems' },
  { value: 'antenna',            label: 'Antenna & TV' },
  { value: 'appliance-repair',   label: 'Appliance Repair' },
  { value: 'curtains-blinds',    label: 'Curtains & Blinds' },
  { value: 'hvac',               label: 'HVAC Technician' },
  // Exempt (no license needed)
  { value: 'handyman',           label: 'Handyman' },
  { value: 'cleaner',            label: 'Cleaning' },
  { value: 'gardening',          label: 'Gardening' },
  { value: 'landscaper',         label: 'Landscaping' },
  { value: 'lawn-mowing',        label: 'Lawn Mowing' },
  { value: 'removalist',         label: 'Removalist' },
  { value: 'rubbish-removal',    label: 'Rubbish Removal' },
  { value: 'window-cleaner',     label: 'Window Cleaner' },
  { value: 'gutter-cleaner',     label: 'Gutter Cleaner' },
  { value: 'interior-decorator', label: 'Interior Decorator' },
  // Hospitality
  { value: 'private-chef',       label: 'Private Chef' },
  { value: 'catering',           label: 'Event Catering' },
];

/** Top 10 most popular trades, shown as quick-select pills. */
export const TOP_10_TRADES = ALL_TRADES.filter(t =>
  ['plumber', 'electrician', 'carpenter', 'cleaner', 'painter',
   'landscaper', 'handyman', 'tiler', 'roofer', 'concreter'].includes(t.value)
);

/**
 * Maps a stored trade value (lowercase, e.g. "cleaner") to the
 * canonical display label used by the licensing Sets (e.g. "Cleaning").
 * Falls back to title-casing the raw value if no match is found.
 */
export function normalizeTradeName(storedValue: string): string {
  if (!storedValue) return '';
  const match = ALL_TRADES.find(t => t.value === storedValue.toLowerCase());
  if (match) return match.label;
  return storedValue.charAt(0).toUpperCase() + storedValue.slice(1);
}

// ── Trade classification ────────────────────────────────────────────

/** Specialist / high-risk trades — always require a license. */
const ALWAYS_LICENSED_TRADES = new Set([
  'Electrical',
  'Plumbing',
  'Gas Fitting',
  'Air Conditioning & Refrigeration',
]);

/**
 * Trades that never require a building/contractor license in any state,
 * regardless of contract value. State monetary thresholds only apply to
 * residential building & construction work — not to service-based trades.
 */
const EXEMPT_TRADES = new Set([
  'Handyman',
  'Cleaning',
  'Gardening',
  'Landscaping',
  'Lawn Mowing',
  'Removalist',
  'Rubbish Removal',
  'Window Cleaner',
  'Gutter Cleaner',
  'Interior Decorator',
]);

/**
 * In WA, only these trades require licensing.
 * Everything else (including general building) is exempt.
 */
const WA_LICENSED_TRADES = new Set([
  'Electrical',
  'Plumbing',
  'Gas Fitting',
  'Painting',
]);

// ── State thresholds & authorities ──────────────────────────────────

/**
 * Dollar threshold (incl. GST) above which a general building trade
 * requires a contractor license for residential work.
 * WA is null because it uses a trade-list model instead of a threshold.
 */
const STATE_THRESHOLDS: Record<AustralianState, number | null> = {
  NSW: 5_000,
  VIC: 10_000,
  QLD: 3_300,
  WA:  null,
  SA:  12_000,
  TAS: 20_000,
  ACT: 12_000,
  NT:  12_000,
};

const STATE_AUTHORITIES: Record<AustralianState, string> = {
  NSW: 'NSW Fair Trading',
  VIC: 'Victorian Building Authority (VBA)',
  QLD: 'QBCC',
  WA:  'Building Services Board',
  SA:  'Consumer & Business Services',
  TAS: 'Consumer, Building & Occupational Services',
  ACT: 'Access Canberra',
  NT:  'NT Building Practitioners Board',
};

// ── Public API ──────────────────────────────────────────────────────

export interface LicensingRequirement {
  /** Whether a license is always required for this trade (specialist). */
  alwaysRequired: boolean;
  /** Whether the trade is completely exempt from licensing. */
  exempt: boolean;
  /** Whether a license is needed given the current state + trade combo. */
  isLicenseRequired: boolean;
  /** Dollar threshold above which a license kicks in (null if always required or exempt). */
  threshold: number | null;
  /** The licensing authority for the given state. */
  authority: string;
  /** Human-readable hint for UI display. */
  hint: string;
}

export function getLicensingRequirements(
  state: AustralianState,
  trade: string,
): LicensingRequirement {
  const authority = STATE_AUTHORITIES[state];
  // Normalize lowercase DB value → title-case label for Set lookups
  const t = normalizeTradeName(trade);

  // 1. Specialist trades — always required everywhere
  if (ALWAYS_LICENSED_TRADES.has(t)) {
    return {
      alwaysRequired: true,
      exempt: false,
      isLicenseRequired: true,
      threshold: null,
      authority,
      hint: `A license is required for ${t} in ${state}. This helps protect you and your clients.`,
    };
  }

  // 2. WA uses a trade-list model instead of a dollar threshold
  if (state === 'WA') {
    if (WA_LICENSED_TRADES.has(t)) {
      return {
        alwaysRequired: true,
        exempt: false,
        isLicenseRequired: true,
        threshold: null,
        authority,
        hint: `${t} requires a license in Western Australia.`,
      };
    }
    // Everything else in WA is exempt
    return {
      alwaysRequired: false,
      exempt: true,
      isLicenseRequired: false,
      threshold: null,
      authority,
      hint: `A trade license is not required for ${t || 'your trade'} in Western Australia.`,
    };
  }

  // 3. Universally exempt trades (Cleaning, Gardening, etc.)
  //    State monetary thresholds do NOT apply — these are service-based
  //    trades, not building/construction work.
  if (EXEMPT_TRADES.has(t)) {
    return {
      alwaysRequired: false,
      exempt: true,
      isLicenseRequired: false,
      threshold: null,
      authority,
      hint: `A trade license is not required for ${t} in ${state}.`,
    };
  }

  // 4. General building trades — threshold-based
  const threshold = STATE_THRESHOLDS[state];
  return {
    alwaysRequired: false,
    exempt: false,
    isLicenseRequired: true,
    threshold,
    authority,
    hint: threshold
      ? `In ${state}, a license is required for residential building work over $${threshold.toLocaleString()}.`
      : `License requirements vary — check with ${authority}.`,
  };
}

/**
 * Quick check used by save logic and verification gates.
 * Returns false when the trade is fully exempt for the given state,
 * meaning the user should NOT be blocked from going live without a license.
 */
export function isLicenseRequiredForTrade(
  state: AustralianState,
  trade: string,
): boolean {
  return getLicensingRequirements(state, trade).isLicenseRequired;
}

/**
 * Returns true if the trade is in the EXEMPT set (no license needed
 * in any state, regardless of contract value).
 */
export function isTradeExempt(trade: string): boolean {
  return EXEMPT_TRADES.has(normalizeTradeName(trade));
}
