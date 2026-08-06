/**
 * User text-size preference — Settings → Interface.
 *
 * Stored per device rather than on the profile, deliberately:
 *  - it applies before auth resolves, so there is no flash at the default size;
 *  - it works on Login, the landing page and public quote pages, where there is
 *    no profile to read;
 *  - a phone and a 27" monitor genuinely want different sizes, so "follows the
 *    user across devices" is not obviously the right behaviour anyway.
 *
 * The value is a multiplier applied to `--ct-text-scale`, which `src/index.css`
 * folds into the root font-size. Because Tailwind's type, spacing and sizing
 * scales are all rem, that scales the whole interface — the same thing browser
 * zoom does — not text alone.
 *
 * Do NOT switch this to assigning `documentElement.style.fontSize`. That is an
 * inline style and would override the min-width rules in index.css, cancelling
 * the large-screen readability bump for everyone.
 *
 * Follows the device-local preference pattern established by
 * `src/lib/siteGeofence.ts`: read/write helpers plus a window event so any
 * mounted component resyncs.
 */

const STORAGE_KEY = 'ct_text_scale';

/** Smallest allowed scale. Below this, 10px meta labels stop being legible. */
export const MIN_TEXT_SCALE = 0.9;
/** Largest allowed scale. Above this the 5-column bottom nav starts to break. */
export const MAX_TEXT_SCALE = 1.3;
export const DEFAULT_TEXT_SCALE = 1;
/** Slider granularity — 9 stops across the range. */
export const TEXT_SCALE_STEP = 0.05;

/** Fired whenever the scale changes, so mounted components resync. */
export const TEXT_SCALE_EVENT = 'ct-text-scale-changed';

/** Clamp to the supported range, falling back to the default on anything odd. */
export function clampTextScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_SCALE;
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, value));
}

/** The stored preference, or the default if unset/unreadable/corrupt. */
export function getTextScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEXT_SCALE;
    return clampTextScale(Number.parseFloat(raw));
  } catch {
    // Storage unavailable (private mode, embedded WebView) — the CSS default
    // in index.css already renders at 1, so there is nothing to recover from.
    return DEFAULT_TEXT_SCALE;
  }
}

/** Write the multiplier to the document. Safe to call before React mounts. */
export function applyTextScale(value: number): void {
  try {
    document.documentElement.style.setProperty('--ct-text-scale', String(clampTextScale(value)));
  } catch { /* no document (SSR/tests) — the stylesheet default stands */ }
}

/** Persist, apply, and notify. */
export function setTextScale(value: number): void {
  const scale = clampTextScale(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch { /* storage unavailable — the setting still applies for this session */ }
  applyTextScale(scale);
  try {
    window.dispatchEvent(new Event(TEXT_SCALE_EVENT));
  } catch { /* no window — ignore */ }
}

/** Read the stored preference and apply it. Call once, as early as possible. */
export function initTextScale(): void {
  applyTextScale(getTextScale());
}

/** For display: 1.15 → 115. */
export function toPercent(scale: number): number {
  return Math.round(scale * 100);
}
