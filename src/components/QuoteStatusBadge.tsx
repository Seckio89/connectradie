// ─────────────────────────────────────────────────────────────────────────────
// QuoteStatusBadge — pill badge that renders a quote's current state.
//
// Used everywhere a quote is shown (QuoteComparisonView, JobDetailsCard,
// dashboards, the future compare-finals view). Role-aware: same status reads
// differently to a client vs tradie (action-oriented for the side who needs
// to act; informational for the other side).
//
// Spec: docs/three-stage-quote-flow.md §3, §5
// Helpers: src/lib/quoteFlow.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { QuoteStatus } from '../types/database';
import {
  getQuoteStatusBadgeStyle,
  getQuoteStatusLabel,
  getQuoteStatusDescription,
  type Role,
} from '../lib/quoteFlow';

interface QuoteStatusBadgeProps {
  status: QuoteStatus;
  /** Who is viewing — changes the wording (action-oriented vs informational). */
  role?: Role;
  /** Optional smaller variant for tight rows (defaults to the standard inline tag size). */
  size?: 'sm' | 'md';
  /** Add the description as a `title` tooltip on hover. */
  withTooltip?: boolean;
  /** Extra classes for layout (margin etc.) — does not override the style. */
  className?: string;
}

export default function QuoteStatusBadge({
  status,
  role = 'client',
  size = 'sm',
  withTooltip = false,
  className = '',
}: QuoteStatusBadgeProps) {
  const style = getQuoteStatusBadgeStyle(status);
  const label = getQuoteStatusLabel(status, role);
  const tooltip = withTooltip ? getQuoteStatusDescription(status, role) : undefined;

  // Match the existing QuoteTag pattern (px-2 py-0.5) for sm; CLAUDE.md
  // page-level pattern (px-3 py-1) for md. Both use rounded-full + border.
  const sizeClasses = size === 'md'
    ? 'px-3 py-1 text-xs'
    : 'px-2 py-0.5 text-xs';

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center ${sizeClasses} rounded-full font-medium border ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {label}
    </span>
  );
}
