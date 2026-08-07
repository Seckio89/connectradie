// ─────────────────────────────────────────────────────────────────────────────
// CostBasisFields — the tradie's private cost basis, used to work out whether a
// quote clears what the job costs to deliver.
//
// Mounted in two places: Settings → Professional (the canonical editor) and
// inline in the estimator's rates panel, so it can be filled in at the moment
// it's needed rather than as a setup step.
//
// Deliberately NOT red tape. Nothing here is required, nothing is validated
// against an award or statutory rate, and leaving it blank simply means no
// margin verdict is shown. The help text names what belongs in each number and
// links to Fair Work; the number itself is the tradie's call. Award rates vary
// by classification, casual vs permanent and penalty rates — asserting a floor
// would be industrial-relations advice this platform is not placed to give.
// ─────────────────────────────────────────────────────────────────────────────

import { COST_BASIS_DEFAULTS } from '../lib/costModel';
import type { CostBasis } from '../lib/costModel';

interface CostBasisFieldsProps {
  value: CostBasis;
  onChange: (next: CostBasis) => void;
  /** Hide the intro line where the surrounding panel already explains itself. */
  compact?: boolean;
}

const inputClass =
  'w-full px-3 py-2 bg-ct-surface border border-ct-line rounded-ct-md text-sm text-ct-paper font-ct-mono ' +
  'focus:outline-none focus:ring-2 focus:ring-ct-teal placeholder:text-ct-mute';

/** Dollars in the field, cents in the model — the DB stores cents throughout. */
const centsToInput = (cents: number): string => (cents > 0 ? String(cents / 100) : '');
const inputToCents = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const inputToPct = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 200) : fallback;
};

function Field({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint: React.ReactNode;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ct-mute-2 mb-1">{label}</label>
      <div className="relative">
        {children}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ct-mute font-ct-mono pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.6875rem] leading-snug text-ct-mute-2">{hint}</p>
    </div>
  );
}

export default function CostBasisFields({ value, onChange, compact = false }: CostBasisFieldsProps) {
  const set = (patch: Partial<CostBasis>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-xs text-ct-mute-2 leading-relaxed">
          What a job costs you to deliver. Fill this in and every quote shows whether it clears your
          costs — nothing is shared with clients, and nothing here changes what you charge.
        </p>
      )}

      <Field
        label="Base hourly wage"
        suffix="$/hr"
        hint={
          <>
            What you <em className="not-italic font-medium text-ct-paper">pay</em> per hour on the tools — your own
            drawing if you work solo. This is not what you charge the client; that's your rate, and the gap
            between the two is where your profit comes from. Your award or agreement sets the floor; see{' '}
            <a
              href="https://www.fairwork.gov.au/pay-and-wages"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ct-teal hover:underline"
            >
              Fair Work
            </a>
            . Leave blank to switch the margin check off.
          </>
        }
      >
        <input
          type="number"
          min="0"
          step="0.5"
          inputMode="decimal"
          className={inputClass}
          placeholder="e.g. 34"
          value={centsToInput(value.staffWageCents)}
          onChange={(e) => set({ staffWageCents: inputToCents(e.target.value) })}
        />
      </Field>

      <Field
        label="Wage on-costs"
        suffix="%"
        hint="What you pay on top of the wage: superannuation, workers' compensation, payroll tax, annual and sick leave, leave loading. Around 30% is typical for an employer; lower if you're solo."
      >
        <input
          type="number"
          min="0"
          max="200"
          step="1"
          inputMode="decimal"
          className={inputClass}
          value={value.labourBurdenPct}
          onChange={(e) => set({ labourBurdenPct: inputToPct(e.target.value, COST_BASIS_DEFAULTS.labourBurdenPct) })}
        />
      </Field>

      <Field
        label="Overhead recovery"
        suffix="%"
        hint="The share of insurance, vehicle, fuel, software, licensing and admin this job needs to carry."
      >
        <input
          type="number"
          min="0"
          max="200"
          step="1"
          inputMode="decimal"
          className={inputClass}
          value={value.overheadRecoveryPct}
          onChange={(e) =>
            set({ overheadRecoveryPct: inputToPct(e.target.value, COST_BASIS_DEFAULTS.overheadRecoveryPct) })
          }
        />
      </Field>

      <Field
        label="Profit target"
        suffix="%"
        hint="Owner pay, profit and money to grow on, over and above wage and overhead."
      >
        <input
          type="number"
          min="0"
          max="200"
          step="1"
          inputMode="decimal"
          className={inputClass}
          value={value.profitTargetPct}
          onChange={(e) => set({ profitTargetPct: inputToPct(e.target.value, COST_BASIS_DEFAULTS.profitTargetPct) })}
        />
      </Field>

      <Field
        label="Minimum job value"
        suffix="$"
        hint="The least you'll take on any job, however small. Leave blank for no minimum."
      >
        <input
          type="number"
          min="0"
          step="10"
          inputMode="decimal"
          className={inputClass}
          placeholder="No minimum"
          value={centsToInput(value.minimumJobValueCents)}
          onChange={(e) => set({ minimumJobValueCents: inputToCents(e.target.value) })}
        />
      </Field>
    </div>
  );
}
