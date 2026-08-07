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
