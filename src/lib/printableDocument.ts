import { Capacitor } from '@capacitor/core';

/**
 * True when the platform can open a print window at all.
 *
 * The Capacitor WebView cannot. `window.open('', '_blank')` there hands the
 * (empty) URL to the system browser, so the user lands on a blank Chrome tab
 * and the document written in afterwards goes to a window that is no longer
 * ours — and Android's WebView ignores `window.print()` outright, so even a
 * same-window fallback prints nothing.
 */
export function canPrintDocument(): boolean {
  return !Capacitor.isNativePlatform();
}

/**
 * Hand a generated HTML document to the browser's print path — a new tab plus
 * the print dialog, which is where "save as PDF" lives.
 *
 * Returns false when the document could not be handed over: on native, and on
 * the web when a pop-up blocker swallows the window. Callers should show the
 * document in-app instead (see DocumentPreviewModal) rather than leaving the
 * button looking broken.
 */
export function printHtmlDocument(html: string): boolean {
  if (!canPrintDocument()) return false;

  const win = window.open('', '_blank');
  if (!win) return false;

  win.document.write(html);
  win.document.close();
  win.setTimeout(() => { win.print(); }, 400);
  return true;
}

/**
 * Make an invoice reference safe to use inside a filename.
 *
 * Invoice refs are mostly `INV-20260807-A1B2`, but they can carry a Stripe id
 * or a hand-entered number, so anything outside the safe set collapses to a
 * hyphen rather than reaching the filesystem or a share target.
 */
export function pdfSafe(reference: string): string {
  return reference.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

/**
 * Flatten a standalone HTML document into a fragment that renders correctly
 * when dropped into an existing page.
 *
 * html2pdf clones whatever you hand it into a container inside the *host*
 * document (see toContainer in html2pdf.js), so a document's `body { ... }`
 * rules would land on the app's real body and never reach the invoice — the
 * invoice would lose its font, width and padding, which are all set there.
 * Rewriting the `body` selector to the wrapper class puts them back on the
 * content they were written for.
 *
 * The remaining selectors are the generators' own class names plus bare
 * `table`/`th`/`td`, matching the offscreen-container approach already used by
 * InvoiceViewModal. They are live only for the second or so the hidden
 * html2pdf overlay is mounted.
 */
export function documentToPdfFragment(html: string, rootClass = 'pdf-root'): string {
  const styles: string[] = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    styles.push(match[1]);
  }

  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const content = body ? body[1] : html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Only a `body` that stands alone as a selector — start of a rule, or after
  // `{`, `}` or `,`. Leaves `.bodycopy` and the like untouched.
  const scoped = styles.join('\n').replace(/(^|[{},])(\s*)body(?=\s*[,{])/gi, `$1$2.${rootClass}`);

  return `<div class="${rootClass}"><style>${scoped}</style>${content}</div>`;
}
