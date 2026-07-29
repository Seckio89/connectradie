/**
 * Design system v2 primitives.
 *
 * Import from here, not from the individual files:
 *   import { Button, Card, Pill } from '../components/ui';
 *
 * These are the only shared primitives for v2 screens. If a screen needs
 * a shape that isn't here, add it here — don't hand-roll it locally. That
 * habit is what produced 279 distinct button shapes and 27 hand-rolled
 * modal overlays in v1.
 *
 * Not yet consumed anywhere. Call sites migrate per primitive in Phase 2b.
 */

export { default as Button, buttonClasses } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { default as Card } from './Card';
export type { CardProps } from './Card';

export { default as Chip } from './Chip';
export type { ChipProps } from './Chip';

export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Field, Input, Select, Textarea } from './Field';
export type { InputProps, SelectProps, TextareaProps } from './Field';

export { default as MilestoneList } from './MilestoneList';
export type { MilestoneItem, MilestoneListProps, MilestoneState } from './MilestoneList';

export { default as Pill } from './Pill';
export type { PillProps, PillTone } from './Pill';

export { default as SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl';

export { Table, Tbody, Td, Th, Thead, Tr } from './Table';
export type { TdProps } from './Table';

export { default as Toast } from './Toast';
export type { ToastProps, ToastTone } from './Toast';

export { default as VariationBlock, VariationAction, VariationAmount } from './VariationBlock';
export type { VariationBlockProps } from './VariationBlock';

export { cx, formatAud, formatAudDelta, FOCUS_RING, META } from './tokens';
