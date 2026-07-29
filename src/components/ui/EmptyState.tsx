import type { ComponentType, ReactNode } from 'react';
import { cx } from './tokens';

export interface EmptyStateProps {
  /** A lucide icon component. Rendered muted. */
  icon?: ComponentType<{ className?: string }>;
  heading: string;
  /**
   * One line naming what will appear here and what puts it there. Not
   * "No data" — "When a tradie needs to change the scope or price, the
   * request lands here for you to approve."
   */
  children: ReactNode;
  /** Exactly one. Two actions means the empty state hasn't decided. */
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  heading,
  children,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'rounded-ct-lg border border-dashed border-ct-line bg-ct-surface/40',
        'px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && <Icon className="mx-auto mb-3 h-6 w-6 text-ct-mute" />}
      <h4 className="font-ct-display text-base font-semibold tracking-tight text-ct-paper">
        {heading}
      </h4>
      <p className="mx-auto mt-2 max-w-[38ch] text-sm text-ct-mute">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
