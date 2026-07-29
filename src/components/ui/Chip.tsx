import type { ReactNode } from 'react';
import { cx, FOCUS_RING } from './tokens';

export interface ChipProps {
  children: ReactNode;
  /** Teal when on, neutral when off. */
  selected?: boolean;
  /** Omit to render a static tag rather than a toggle. */
  onClick?: () => void;
  className?: string;
}

/**
 * A tag or a filter toggle — trades on a job, a verified credential.
 *
 * 6px radius: the smallest step, since a chip is usually nested two
 * levels deep inside a card.
 */
export default function Chip({ children, selected = false, onClick, className }: ChipProps) {
  const shell = cx(
    'inline-block rounded-ct-xs border px-3 py-1.5 text-xs',
    selected
      ? 'border-ct-teal/30 bg-ct-teal/[0.14] text-ct-teal'
      : 'border-ct-line bg-ct-surface-2 text-ct-mute-2',
    className,
  );

  if (!onClick) {
    return <span className={shell}>{children}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(shell, 'transition-colors duration-150 hover:text-ct-paper', FOCUS_RING)}
    >
      {children}
    </button>
  );
}
