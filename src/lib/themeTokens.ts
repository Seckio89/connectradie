// Read design tokens from JS.
//
// CSS variables resolve in the DOM, so styling should almost always use a
// `ct-` Tailwind class or `var(--token)` directly — see CLAUDE.md. This helper
// exists for the one place that cannot: **canvas**. Chart.js paints to a 2D
// context, which has no cascade and no custom properties, so `var(--teal)`
// reaches it as an uninterpretable string and the shape silently does not draw.
//
// That is the same reason print/PDF/e-mail generators are exempt: they render
// where CSS variables do not resolve. The difference is that those must hard-
// code a literal, whereas canvas can read the real token at runtime — so it
// should, and stays correct if a token ever changes.

/** A resolved token value, e.g. `token('--teal')` → `"rgb(18, 211, 180)"`. */
export function token(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * A token as `rgba(...)` with an alpha applied.
 *
 * Reads the channel-triplet form (`--teal-c: 18 211 180`), which is the whole
 * reason the tokens are declared as triplets in the first place. Pass the base
 * name — `tokenAlpha('teal', 0.1)` reads `--teal-c`.
 */
export function tokenAlpha(base: string, alpha: number, fallback = 'transparent'): string {
  const channels = token(`--${base}-c`);
  if (!channels) return fallback;
  const [r, g, b] = channels.split(/[\s,]+/);
  if (!r || !g || !b) return fallback;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
