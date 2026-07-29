import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx, FOCUS_RING } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  // Teal = the action to take. Hover lifts via brightness rather than a
  // second teal token, so the palette stays at one teal.
  primary: 'bg-ct-teal text-ct-ink border-transparent hover:brightness-110',
  secondary: 'bg-ct-surface-2 text-ct-paper border-ct-line hover:border-ct-teal-deep',
  ghost: 'bg-transparent text-ct-mute-2 border-ct-line hover:text-ct-paper hover:border-ct-mute',
  danger: 'bg-transparent text-ct-rose border-ct-rose/40 hover:bg-ct-rose/10',
};

const SIZE: Record<ButtonSize, string> = {
  // min-h-11 is 44px — the mobile touch-target floor, met without
  // resorting to a full-width button.
  default: 'text-sm px-4 py-2.5 min-h-11',
  sm: 'text-xs px-3 py-1.5 min-h-9',
};

const BASE = cx(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'font-ct-display font-semibold',
  'rounded-ct-sm border', // 9px — steps down inside a 14px card
  'transition-[background-color,border-color,color,filter] duration-150',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100',
  FOCUS_RING,
);

/**
 * Classes for a button-shaped element that isn't a `<button>` — a react-router
 * `<Link>`, or an `<a>` on the marketing site. Prefer `<Button>` itself
 * wherever the element really is a button.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'default',
  fullWidth = false,
): string {
  return cx(BASE, VARIANT[variant], SIZE[size], fullWidth && 'w-full');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Only inside a modal, or on mobile. Never in a normal page flow. */
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * A button names what happens, and keeps that name: `Release payment`
 * produces a toast reading `Payment released`. Sentence case.
 */
export default function Button({
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClasses(variant, size, fullWidth), className)}
      {...rest}
    >
      {children}
    </button>
  );
}
