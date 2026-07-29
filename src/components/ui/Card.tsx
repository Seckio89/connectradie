import type { ReactNode } from 'react';
import { cx } from './tokens';

export interface CardProps {
  /** Card title. Omit both title and action for a bare card. */
  title?: ReactNode;
  /** Right-aligned slot in the header — a pill, a small button. */
  action?: ReactNode;
  children: ReactNode;
  /**
   * Drop the body padding. For cards whose body is a table or a list group
   * that manages its own edges.
   */
  flush?: boolean;
  className?: string;
}

/**
 * The standard surface. 14px radius, so anything nested inside steps down
 * to 12px (inputs) or 9px (buttons, pills).
 */
export default function Card({ title, action, children, flush, className }: CardProps) {
  const hasHeader = title !== undefined || action !== undefined;

  return (
    <div
      className={cx(
        'bg-ct-surface border border-ct-line rounded-ct-lg overflow-hidden',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center gap-3 border-b border-ct-line px-4 py-3.5">
          {title !== undefined && (
            <h3 className="flex-1 min-w-0 font-ct-display text-base font-semibold tracking-tight text-ct-paper">
              {title}
            </h3>
          )}
          {action !== undefined && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={flush ? undefined : 'p-4'}>{children}</div>
    </div>
  );
}
