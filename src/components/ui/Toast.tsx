import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';
import { cx, FOCUS_RING } from './tokens';

/**
 *   ok   — it happened          "Payment released"
 *   warn — someone must act     "Variation waiting on you"
 *   bad  — it failed            "Couldn't release payment"
 */
export type ToastTone = 'ok' | 'warn' | 'bad';

const TONE: Record<ToastTone, { shell: string; title: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    shell: 'bg-ct-teal/[0.14] border-ct-teal/30',
    title: 'text-ct-teal',
    Icon: CheckCircle2,
  },
  warn: {
    shell: 'bg-ct-amber/[0.13] border-ct-amber/[0.34]',
    title: 'text-ct-amber',
    Icon: AlertTriangle,
  },
  bad: {
    shell: 'bg-ct-rose/[0.13] border-ct-rose/[0.34]',
    title: 'text-ct-rose',
    Icon: XCircle,
  },
};

export interface ToastProps {
  tone?: ToastTone;
  /**
   * Echoes the button that caused it: `Release payment` → `Payment
   * released`. Same verb through the whole flow.
   */
  title: string;
  /** What it means for them. On `bad`, how to fix it — never an apology. */
  children?: ReactNode;
  onDismiss?: () => void;
}

/**
 * Presentation only — it doesn't position itself or manage its own
 * lifetime. A single toast region owns that, so toasts can't end up in
 * four different corners at four z-indexes the way Phase 0 found.
 */
export default function Toast({ tone = 'ok', title, children, onDismiss }: ToastProps) {
  const { shell, title: titleTone, Icon } = TONE[tone];

  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-3 rounded-ct-md border p-3.5',
        'motion-safe:animate-ct-slide-in',
        shell,
      )}
    >
      <Icon className={cx('mt-0.5 h-4 w-4 flex-none', titleTone)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <strong className={cx('block font-ct-display text-sm font-semibold', titleTone)}>
          {title}
        </strong>
        {children !== undefined && (
          <p className="mt-0.5 text-sm text-ct-mute-2">{children}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cx(
            '-m-1 flex h-8 w-8 flex-none items-center justify-center rounded-ct-xs',
            'text-ct-mute transition-colors hover:text-ct-paper',
            FOCUS_RING,
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
