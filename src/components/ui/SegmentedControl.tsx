import { cx, FOCUS_RING } from './tokens';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Describes the choice for screen readers, e.g. "Job type". */
  ariaLabel: string;
  /** Fills the container and splits evenly. Use on mobile. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * A small set of mutually exclusive choices — one-off vs ongoing, or the
 * landing page's audience switch.
 *
 * `aria-pressed` on grouped buttons rather than radios: these switch a
 * view immediately, they don't stage a value for submission.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex gap-0.5 rounded-ct-md border border-ct-line bg-ct-ink p-0.5',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-ct-xs px-4 py-2 text-sm transition-colors duration-150 min-h-9',
              fullWidth && 'flex-1',
              selected
                ? 'bg-ct-teal font-semibold text-ct-ink'
                : 'text-ct-mute hover:text-ct-paper',
              FOCUS_RING,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
