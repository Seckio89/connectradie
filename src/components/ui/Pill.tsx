import type { ReactNode } from 'react';
import { cx, META } from './tokens';

/**
 * Status pill tones. These are meanings, not colours — see the semantic
 * rule in CLAUDE.md. Picking a tone because it looks right is how the
 * signal dies.
 *
 *   teal  — money moving as agreed  (Funded, Released, In progress)
 *   amber — blocked on a person     (Awaiting approval, Variation pending)
 *   rose  — failed or declined      (Declined, Payment failed)
 *   grey  — no state yet            (Draft, Awaiting quotes)
 */
export type PillTone = 'teal' | 'amber' | 'rose' | 'grey';

const TONE: Record<PillTone, string> = {
  teal: 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30',
  amber: 'bg-ct-amber/[0.13] text-ct-amber border-ct-amber/[0.34]',
  rose: 'bg-ct-rose/[0.13] text-ct-rose border-ct-rose/[0.34]',
  grey: 'bg-ct-surface-2 text-ct-mute border-ct-line',
};

export interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

export default function Pill({ tone = 'grey', children, className }: PillProps) {
  return (
    <span
      className={cx(
        META,
        'inline-block whitespace-nowrap border px-2.5 py-1',
        'rounded-ct-sm', // 9px — same family as buttons
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
