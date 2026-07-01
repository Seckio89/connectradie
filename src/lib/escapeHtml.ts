/**
 * Escape user/DB-controlled text before interpolating it raw into an HTML
 * string that will be parsed as markup — e.g. a print-window document written
 * via `document.write`, a `<title>`, or an offscreen html2pdf container.
 *
 * Order matters: `&` is replaced first so the entities introduced by the later
 * replacements are not double-encoded. Handles null/undefined/numbers safely.
 *
 * Do NOT pass values that already come from React-rendered `innerHTML` through
 * this — React has already escaped them, and re-escaping would double-encode
 * legitimate characters (e.g. show `&amp;` literally).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
