import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cx, FOCUS_RING } from './tokens';

/**
 * One field shape and one focus treatment for the whole system.
 *
 * 12px radius — steps down inside a 14px card, up from a 9px button.
 */
const CONTROL = cx(
  'w-full bg-ct-ink text-ct-paper placeholder:text-ct-placeholder',
  'border border-ct-line rounded-ct-md',
  'px-3 py-2.5 text-sm min-h-11',
  'transition-colors duration-150',
  // Teal border on any focus, plus the shared outline for keyboard focus.
  // The border alone is a 1px colour shift — too weak to be the only
  // keyboard indicator.
  'focus:border-ct-teal',
  FOCUS_RING,
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

const CONTROL_ERROR = 'border-ct-rose focus:border-ct-rose';

interface FieldShellProps {
  label?: ReactNode;
  /** Shown above the control. Explains what to enter, before they enter it. */
  hint?: ReactNode;
  /**
   * Says what failed and how to fix it — "Extra days can't be negative.
   * Enter 0 if there's no delay." Never "Invalid input".
   */
  error?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

/**
 * Label, hint, control, error — wired together with the aria the control
 * needs. Use the exported Input/Select/Textarea rather than this directly
 * unless you're building something unusual.
 */
export function Field({ label, hint, error, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cx(hint ? hintId : '', error ? errorId : '').trim() || undefined;

  return (
    <div className={cx('mb-4', className)}>
      {label !== undefined && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ct-paper">
          {label}
        </label>
      )}
      {hint !== undefined && (
        <p id={hintId} className="mb-2 text-xs text-ct-mute">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error !== undefined && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-ct-rose">
          {error}
        </p>
      )}
    </div>
  );
}

type Shared = { label?: ReactNode; hint?: ReactNode; error?: string; fieldClassName?: string };

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> &
  Shared & {
    /** Renders the value in mono. Use for every dollar figure and reference. */
    numeric?: boolean;
  };

export function Input({
  label,
  hint,
  error,
  fieldClassName,
  numeric,
  className,
  ...rest
}: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(CONTROL, invalid && CONTROL_ERROR, numeric && 'font-ct-mono', className)}
          {...rest}
        />
      )}
    </Field>
  );
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> &
  Shared & { children: ReactNode };

export function Select({
  label,
  hint,
  error,
  fieldClassName,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(CONTROL, invalid && CONTROL_ERROR, className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & Shared;

export function Textarea({
  label,
  hint,
  error,
  fieldClassName,
  className,
  ...rest
}: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(CONTROL, 'min-h-20 resize-y', invalid && CONTROL_ERROR, className)}
          {...rest}
        />
      )}
    </Field>
  );
}
