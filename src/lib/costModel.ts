// ─────────────────────────────────────────────────────────────────────────────
// costModel — does this quote actually clear what the job costs to deliver?
//
// The rest of the pricing stack answers "what should I charge": the estimator
// builds a price up from hours × the tradie's CHARGE-OUT rate, plus materials,
// markup, call-out and margin. Nothing in it ever checks that the charge-out
// rate covers the cost of doing the work — tradie_details.hourly_rate is a
// public, advertised number (PublicTradieProfile renders it as "$X/hr"), not a
// cost basis. A quote can look healthy and still be underwater.
//
// This module is the missing floor. It runs the standard contracting cost
// chain — wage → burden → direct cost → overhead → profit → minimum viable
// price — and reports the cushion between that floor and what the tradie
// actually banks.
//
// Two things a spreadsheet doing this by hand gets to ignore and we cannot:
//
//   1. GST is not income. It is collected for the ATO and passed straight
//      through, so the comparison is against the EX-GST subtotal. Comparing a
//      GST-inclusive total against a cost floor overstates the cushion by 10%
//      for every registered tradie — enough on its own to turn a loss green.
//   2. Platform commission comes off the top. A free-tier tradie pays 800 bps
//      of labour, so a 10% cushion computed gross is a loss once it is netted.
//      Callers pass the fee in (see calculatePlatformFee in ./subscription),
//      which is what lets this beat any offline calculator.
//
// Deliberately trade-agnostic: nothing here knows about cleaning, or any other
// trade. Wage → burden → overhead → profit is the same arithmetic for a sparky,
// a painter and a landscaper. It is also currency- and unit-agnostic — cents
// and percentages only — so it ports to another market unchanged.
//
// ADVISORY, NEVER GATING. Callers must not block a quote on a 'below' verdict.
// This tells the tradie what their own numbers say; the decision stays theirs.
// ─────────────────────────────────────────────────────────────────────────────

/** A tradie's private cost basis. Never exposed to clients. */
export interface CostBasis {
  /** Base hourly wage actually paid on the tools (own drawing if solo). */
  staffWageCents: number;
  /** On-costs as a % of wage: super, workers' comp, payroll tax, leave loading. */
  labourBurdenPct: number;
  /** Fixed costs to recover, as a % of direct cost: insurance, vehicle, software, admin. */
  overheadRecoveryPct: number;
  /** Owner pay + profit + growth, as a % of direct cost incl. overhead. */
  profitTargetPct: number;
  /** Floor under the minimum viable price. 0 = no floor. */
  minimumJobValueCents: number;
}

/**
 * AU-realistic starting points. Burden sits at 30 rather than the 40 seen on US
 * worksheets: superannuation 12% + workers' comp + state payroll tax + 4 weeks'
 * leave with 17.5% loading lands nearer 1.30 here.
 *
 * These are starting points, NOT policy — every one is tradie-overridable, and
 * nothing validates an entered value against an award or statutory rate. A wage
 * of 0 means "not set": checkMargin returns null and no verdict is shown.
 */
export const COST_BASIS_DEFAULTS: CostBasis = {
  staffWageCents: 0,
  labourBurdenPct: 30,
  overheadRecoveryPct: 20,
  profitTargetPct: 20,
  minimumJobValueCents: 0,
};

/** Cushion below this share of the floor reads as thin rather than healthy. */
const THIN_CUSHION_RATIO = 0.1;

/** Widest values the maths stays meaningful over. Sanity bounds, not policy. */
const MAX_PCT = 200;
const MAX_HOURS = 10_000;
const MAX_WORKERS = 100;

export type MarginStatus = 'below' | 'thin' | 'healthy';

export interface MarginCheck {
  loadedHourlyCents: number;
  labourCostCents: number;
  materialsCostCents: number;
  directCostCents: number;
  withOverheadCents: number;
  /** The floor: direct + overhead + profit, never under minimumJobValueCents. */
  minViableCents: number;
  /** Whether minimumJobValueCents is what set the floor. */
  minimumApplied: boolean;
  /** Quoted ex-GST less platform commission — what the tradie actually banks. */
  netToTradieCents: number;
  /** netToTradie − minViable. Negative means the job loses money. */
  cushionCents: number;
  status: MarginStatus;
}

export interface MarginCheckInput {
  /** On-site hours for the job (per worker when workers > 1). */
  hours: number;
  workers: number;
  /** Materials at COST — not marked up. Markup is revenue, not cost. */
  materialsCostCents: number;
  /** The quoted price excluding GST. Use the subtotal, never the total. */
  quotedExGstCents: number;
  /** Platform commission on this job, from calculatePlatformFee. */
  platformFeeCents: number;
  basis: CostBasis;
}

const clamp = (n: number, min: number, max: number): number =>
  Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;

/** True once the tradie has entered a wage — the one field with no usable default. */
export function hasCostBasis(basis: CostBasis | null | undefined): boolean {
  return !!basis && basis.staffWageCents > 0;
}

/**
 * Run the cost chain and compare it against what the tradie banks.
 *
 * Returns null when no wage is set, which is the no-verdict case: the panel
 * renders nothing rather than nagging. Every other field has a workable default,
 * so a wage alone is enough to switch the whole feature on.
 */
export function checkMargin(input: MarginCheckInput): MarginCheck | null {
  const { basis } = input;
  if (!hasCostBasis(basis)) return null;

  const wage = Math.max(0, basis.staffWageCents);
  const burden = clamp(basis.labourBurdenPct, 0, MAX_PCT);
  const overhead = clamp(basis.overheadRecoveryPct, 0, MAX_PCT);
  const profit = clamp(basis.profitTargetPct, 0, MAX_PCT);
  const minimum = Math.max(0, basis.minimumJobValueCents);

  const hours = clamp(input.hours, 0, MAX_HOURS);
  const workers = Math.max(1, Math.round(clamp(input.workers, 1, MAX_WORKERS)));
  const materialsCostCents = Math.round(Math.max(0, input.materialsCostCents));

  const loadedHourlyCents = Math.round(wage * (1 + burden / 100));
  const labourCostCents = Math.round(hours * workers * loadedHourlyCents);
  const directCostCents = labourCostCents + materialsCostCents;
  const withOverheadCents = Math.round(directCostCents * (1 + overhead / 100));

  const targetCents = Math.round(withOverheadCents * (1 + profit / 100));
  // The floor is whichever binds harder — the cost chain or the tradie's own
  // minimum job value. A 20-minute callout costs almost nothing to deliver but
  // still shouldn't go out at $12.
  const minimumApplied = minimum > targetCents;
  const minViableCents = minimumApplied ? minimum : targetCents;

  // Ex-GST, less commission: GST is the ATO's, commission is the platform's.
  // What's left is the only figure worth comparing against cost.
  const netToTradieCents =
    Math.round(input.quotedExGstCents) - Math.round(Math.max(0, input.platformFeeCents));
  const cushionCents = netToTradieCents - minViableCents;

  const status: MarginStatus =
    cushionCents < 0 ? 'below'
    : cushionCents < minViableCents * THIN_CUSHION_RATIO ? 'thin'
    : 'healthy';

  return {
    loadedHourlyCents,
    labourCostCents,
    materialsCostCents,
    directCostCents,
    withOverheadCents,
    minViableCents,
    minimumApplied,
    netToTradieCents,
    cushionCents,
    status,
  };
}

/**
 * What gets persisted alongside a sent quote, so the pricing can be reopened and
 * understood later instead of surviving as a single rounded integer.
 *
 * A `type` rather than an `interface` on purpose: only a type alias satisfies the
 * generated `Json` index signature, and this is written straight into a jsonb
 * column. `v` is the schema version — bump it if the shape changes, and read it
 * before trusting any other field.
 */
export type QuoteCostSnapshot = {
  v: 1;
  hours: number;
  workers: number;
  hoursMode?: 'perCleaner' | 'combined';
  hourlyRateCents: number;
  marginPct: number;
  materialsMarkupPct: number;
  materialsCostCents: number;
  minViableCents: number;
  cushionCents: number;
  status: MarginStatus;
};

/** Build the persisted snapshot from a completed margin check. */
export function toCostSnapshot(
  check: MarginCheck,
  pricing: {
    hours: number;
    workers: number;
    hoursMode?: 'perCleaner' | 'combined';
    hourlyRateCents: number;
    marginPct: number;
    materialsMarkupPct: number;
  },
): QuoteCostSnapshot {
  return {
    v: 1,
    hours: pricing.hours,
    workers: pricing.workers,
    ...(pricing.hoursMode ? { hoursMode: pricing.hoursMode } : {}),
    hourlyRateCents: Math.round(pricing.hourlyRateCents),
    marginPct: pricing.marginPct,
    materialsMarkupPct: pricing.materialsMarkupPct,
    materialsCostCents: check.materialsCostCents,
    minViableCents: check.minViableCents,
    cushionCents: check.cushionCents,
    status: check.status,
  };
}

/** Short verdict for the panel header. Names the fix, never scolds. */
export function marginStatusLabel(status: MarginStatus): string {
  switch (status) {
    case 'below':
      return 'Below your costs';
    case 'thin':
      return 'Thin margin';
    case 'healthy':
      return 'Clears your costs';
  }
}

/**
 * One line of plain guidance under the verdict. Phrased as what the tradie can
 * do about it — the estimator's job is to suggest, not to grade.
 */
export function marginStatusHint(check: MarginCheck): string {
  switch (check.status) {
    case 'below':
      return 'This quote does not cover your wage, overhead and profit target. Raise the price, cut the hours, or pass on the job.';
    case 'thin':
      return 'This quote clears your costs, but there is little room if the job runs over.';
    case 'healthy':
      return 'This quote covers your costs, overhead and profit target.';
  }
}
