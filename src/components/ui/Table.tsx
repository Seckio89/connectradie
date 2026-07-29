import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx, META } from './tokens';

/**
 * Data table.
 *
 * Numeric cells are mono, which is the point: quotes, variations and
 * invoices are numeric documents, and mono makes amounts align down a
 * column. That matters most on a property manager screen with twelve
 * properties in view.
 *
 * Sits inside a `<Card flush>` — the card owns the border and radius.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  // The wrapper scrolls rather than the page: a wide table must never
  // make the document scroll sideways on mobile.
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'border-b border-ct-line-soft last:border-b-0',
        'transition-colors duration-150 hover:bg-ct-surface-2',
        onClick && 'cursor-pointer',
      )}
    >
      {children}
    </tr>
  );
}

export function Th({
  children,
  numeric,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cx(
        META,
        'border-b border-ct-line px-3.5 py-3 font-medium text-ct-mute',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Mono, right-aligned. Every dollar figure, count and reference. */
  numeric?: boolean;
  /** Secondary line under the cell's main content — a job ref, a suburb. */
  subLabel?: ReactNode;
}

export function Td({ children, numeric, subLabel, className, ...rest }: TdProps) {
  return (
    <td
      className={cx(
        'px-3.5 py-3 align-top text-ct-mute-2',
        numeric && 'font-ct-mono text-right text-ct-paper',
        className,
      )}
      {...rest}
    >
      {children}
      {subLabel !== undefined && (
        <span className="mt-0.5 block text-xs text-ct-mute">{subLabel}</span>
      )}
    </td>
  );
}
