import type { ReactNode } from 'react';
import { cx, formatAudDelta, FOCUS_RING } from './tokens';

/**
 * A scope change waiting on a decision.
 *
 * This is the one place amber appears in a job view, and that's the whole
 * point: amber means a person is blocking progress. If amber starts
 * showing up decoratively elsewhere, this stops being readable at a
 * glance and the pattern is dead.
 */
export interface VariationBlockProps {
  /** Defaults to the standard wording. Override only for a real variant. */
  title?: string;
  /** The change, in the tradie's own words, plus its cost and time impact. */
  children: ReactNode;
  /** One or two `<VariationAction>`s. */
  actions?: ReactNode;
  className?: string;
}

export default function VariationBlock({
  title = 'Variation requested',
  children,
  actions,
  className,
}: VariationBlockProps) {
  return (
    <section
      aria-label={title}
      className={cx(
        'rounded-ct-md border border-ct-amber/[0.34] bg-ct-amber/[0.13] px-4 py-3.5',
        'motion-safe:animate-ct-slide-in',
        className,
      )}
    >
      <h4 className="mb-2 font-ct-mono text-ct-meta font-bold uppercase text-ct-amber">
        <span aria-hidden="true">⚠ </span>
        {title}
      </h4>
      {/* Neutral body on purpose. If the whole sentence is amber, the
          amount inside it stops standing out — and the amount is the part
          being decided on. 6.72:1 here, against 5.58:1 for amber text. */}
      <div className="text-sm leading-relaxed text-ct-mute-2">{children}</div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/**
 * An amount inside a variation body: `+$1,200`, or `−$400` on a credit.
 * Mono and amber so it's findable without reading the sentence.
 */
export function VariationAmount({ amountCents }: { amountCents: number }) {
  return (
    <b className="whitespace-nowrap font-ct-mono font-bold text-ct-amber">
      {formatAudDelta(amountCents)}
    </b>
  );
}

/**
 * Amber-toned action, scoped to this block.
 *
 * Deliberately not a Button variant. Amber on a button means "this
 * decision is what's blocking the job", which is only true inside a
 * variation — exposing it as a general variant would invite exactly the
 * decorative use that kills the signal.
 */
export function VariationAction({
  children,
  primary = false,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center rounded-ct-sm border px-3 py-1.5',
        'font-ct-display text-xs font-semibold min-h-9',
        'transition-[filter,background-color] duration-150 hover:brightness-110',
        primary
          ? 'border-ct-amber bg-ct-amber text-ct-ink'
          : 'border-ct-amber/40 bg-transparent text-ct-amber',
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  );
}
