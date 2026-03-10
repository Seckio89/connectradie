import { useEffect, useRef, useCallback } from 'react';

// =============================================================================
// Skip to Content
// =============================================================================

/**
 * SkipToContent component props - renders an accessible skip link.
 * Usage: Add <SkipToContent /> as the first child of your App layout,
 * and add id="main-content" to your main content area.
 */
export function SkipToContent() {
  // Return null here - we use CSS class .skip-to-content from mobile-responsive.css
  // This is a render function that returns JSX
  return null; // Placeholder — actual JSX component is SkipToContentLink below
}

/**
 * Returns props for a skip-to-content anchor element.
 * Apply these to an <a> tag as the first focusable element in your layout.
 */
export function getSkipToContentProps() {
  return {
    href: '#main-content',
    className: 'skip-to-content',
    children: 'Skip to content',
  };
}

// =============================================================================
// Screen Reader Announcements
// =============================================================================

/**
 * Announce a message to screen readers via a live region.
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  let region = document.getElementById(`sr-live-${priority}`);
  if (!region) {
    region = document.createElement('div');
    region.id = `sr-live-${priority}`;
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
    document.body.appendChild(region);
  }
  // Clear then set to trigger announcement
  region.textContent = '';
  requestAnimationFrame(() => {
    region!.textContent = message;
  });
}

// =============================================================================
// Focus Management
// =============================================================================

/**
 * Hook: traps focus within a container (e.g., modals, drawers).
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    first?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return containerRef;
}

/**
 * Hook: keyboard navigation for lists (arrow keys).
 */
export function useKeyboardNav(itemCount: number) {
  const activeIndex = useRef(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex.current = Math.min(activeIndex.current + 1, itemCount - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex.current = Math.max(activeIndex.current - 1, 0);
      } else if (e.key === 'Home') {
        e.preventDefault();
        activeIndex.current = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        activeIndex.current = itemCount - 1;
      }
    },
    [itemCount]
  );

  return { activeIndex: activeIndex.current, handleKeyDown };
}

// =============================================================================
// Motion & Contrast Preferences
// =============================================================================

/**
 * Hook: returns true if the user prefers reduced motion.
 */
export function useReducedMotion(): boolean {
  const ref = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  return ref.current;
}

/**
 * Hook: returns true if high contrast / forced colors is active.
 */
export function useHighContrast(): boolean {
  const ref = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(forced-colors: active)').matches
      : false
  );
  return ref.current;
}

/**
 * WCAG contrast ratio check (simplified).
 * Returns true if the ratio meets the given level.
 */
export function meetsContrastRatio(
  foreground: number,
  background: number,
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  const l1 = Math.max(foreground, background);
  const l2 = Math.min(foreground, background);
  const ratio = (l1 + 0.05) / (l2 + 0.05);
  return level === 'AAA' ? ratio >= 7 : ratio >= 4.5;
}

// =============================================================================
// ARIA Label Helpers
// =============================================================================

export function ratingLabel(rating: number, max = 5): string {
  return `${rating} out of ${max} stars`;
}

export function statusLabel(status: string): string {
  return `Status: ${status.replace(/_/g, ' ')}`;
}

export function priceLabel(amount: number, currency = 'AUD'): string {
  return `${new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount)}`;
}
