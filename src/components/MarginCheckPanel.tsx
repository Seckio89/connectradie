// ─────────────────────────────────────────────────────────────────────────────
// MarginCheckPanel — does this quote clear what the job costs to deliver?
//
// TRADIE-ONLY. This renders the tradie's wage, overhead and profit target back
// at them; a client must never see it. Guarded on role the same way
// QuoteFeeDisclosure is, and the underlying data sits in tradie-private tables
// (see the migration comment on quote_cost_snapshots for why it is not a column
// on `quotes`).
//
// ADVISORY, NEVER GATING. A 'below' verdict does not disable anything, block a
// submit, or raise a confirmation. The tradie may have good reasons to take a
// job at a loss — a foot in the door with a builder, a quiet fortnight. The
// panel's job is to make sure that choice is deliberate rather than accidental.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { ChevronDown, TrendingUp, AlertTriangle, MinusCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { marginStatusLabel, marginStatusHint } from '../lib/costModel';
import type { MarginCheck, MarginStatus } from '../lib/costModel';

interface MarginCheckPanelProps {
  check: MarginCheck | null;
  /**
   * Lowest price that would clear the cost floor, from priceToClearCostsCents.
   * Optional: callers without a fee context simply get no target line.
   */
  targetPriceCents?: number | null;
  className?: string;
}

const money = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${Math.abs(cents / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Semantic colour is fixed by the design system: teal = money as agreed,
// amber = a call for the tradie to make, rose = it doesn't work.
//
// Body text inside these tinted fills uses ct-mute-2, never ct-mute — ct-mute
// measures under AA once composited over a dim tint on a card surface.
const TONE: Record<MarginStatus, { wrap: string; text: string; Icon: typeof TrendingUp }> = {
  healthy: { wrap: 'bg-ct-teal/[0.14] border-ct-teal/30', text: 'text-ct-teal', Icon: TrendingUp },
  thin: { wrap: 'bg-ct-amber/[0.13] border-ct-amber/30', text: 'text-ct-amber', Icon: AlertTriangle },
  below: { wrap: 'bg-ct-rose/[0.13] border-ct-rose/30', text: 'text-ct-rose', Icon: MinusCircle },
};

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`text-[0.6875rem] ${strong ? 'text-ct-paper font-medium' : 'text-ct-mute-2'}`}>{label}</span>
      <span className={`text-xs font-ct-mono tabular-nums ${strong ? 'text-ct-paper font-medium' : 'text-ct-mute-2'}`}>
        {value}
      </span>
    </div>
  );
}

export default function MarginCheckPanel({ check, targetPriceCents, className = '' }: MarginCheckPanelProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  // No cost basis set, or not a tradie → render nothing at all. The absence of
  // a verdict is the correct state, not something to prompt about.
  if (!check || profile?.role !== 'tradie') return null;

  const tone = TONE[check.status];
  const { Icon } = tone;

  // Per-hour framing: the same verdict divided by the hours, which is the unit a
  // tradie prices in. Guarded on hours because a materials-only job divides by 0.
  const perHour = check.labourHoursTotal > 0
    ? {
        brings: Math.round(check.netToTradieCents / check.labourHoursTotal),
        needs: Math.round(check.minViableCents / check.labourHoursTotal),
      }
    : null;

  return (
    <div className={`border rounded-ct-md ${tone.wrap} ${className}`}>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.text}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className={`text-sm font-semibold ${tone.text}`}>{marginStatusLabel(check.status)}</span>
              <span className={`text-sm font-ct-mono tabular-nums ${tone.text}`}>
                {money(check.cushionCents)}
              </span>
            </div>
            <p className="mt-1 text-[0.6875rem] leading-snug text-ct-mute-2">{marginStatusHint(check)}</p>
          </div>
        </div>

        {/* What to actually change. A verdict without a number to aim at leaves the
            tradie to work out the fix themselves, which is the part they came here
            for. Shown only when something needs fixing.

            No tinted fill in here: the panel wrap already carries one, and a second
            dim layer composites under AA (see the tint-compounding note in
            CLAUDE.md). A rule and plain text, like the breakdown below. */}
        {check.status !== 'healthy' && (targetPriceCents != null || perHour != null) && (
          <div className="mt-2.5 pt-2.5 border-t border-ct-line-soft/40 space-y-1.5">
            <p className="font-ct-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] text-ct-mute-2">
              What would fix it
            </p>
            {targetPriceCents != null && (
              <p className="text-[0.6875rem] leading-snug text-ct-mute-2">
                Quote <span className={`font-medium font-ct-mono ${tone.text}`}>{money(targetPriceCents)}</span> or
                more and this job clears your costs.
              </p>
            )}
            {perHour != null && (
              <p className="text-[0.6875rem] leading-snug text-ct-mute-2">
                Each hour brings in <span className="font-medium font-ct-mono text-ct-paper">{money(perHour.brings)}</span>
                {' '}— it needs to bring in <span className="font-medium font-ct-mono text-ct-paper">{money(perHour.needs)}</span>.
                {' '}Charge more per hour, or allow fewer hours.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] text-ct-mute-2 hover:text-ct-paper transition-colors"
          aria-expanded={open}
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? 'Hide the numbers' : 'Show the numbers'}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 border-t border-ct-line-soft/40 pt-2">
          <Row label={`Wage + on-costs, per hour`} value={money(check.loadedHourlyCents)} />
          <Row label="Labor on this job" value={money(check.labourCostCents)} />
          {check.materialsCostCents > 0 && <Row label="Materials at cost" value={money(check.materialsCostCents)} />}
          <Row label="Direct cost" value={money(check.directCostCents)} strong />
          <Row label="With overhead recovered" value={money(check.withOverheadCents)} />
          <Row
            label={check.minimumApplied ? 'Your minimum job value' : 'With profit target — minimum viable'}
            value={money(check.minViableCents)}
            strong
          />
          <div className="my-1 border-t border-ct-line-soft/40" />
          <Row label="You receive, after fees and GST" value={money(check.netToTradieCents)} />
          <Row label="Cushion" value={money(check.cushionCents)} strong />
          {check.minimumApplied && (
            <p className="mt-2 text-[0.625rem] leading-snug text-ct-mute-2">
              Your minimum job value is higher than this job's costs, so it sets the floor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
