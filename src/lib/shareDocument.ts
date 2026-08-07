import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { documentToPdfFragment } from './printableDocument';

/**
 * True when the platform can hand a file to other apps.
 *
 * Native only. The web already has the print dialog, which is a better path to
 * the same places (save as PDF, print) and needs no temp file.
 *
 * The plugin check matters because the app is a remote-loading shell: this
 * code goes live on every installed version the moment the site deploys, but
 * the Share/Filesystem plugins only exist in shells built after they were
 * added. isPluginAvailable reads the native bridge's plugin registry, so old
 * shells hide the button (and show the open-in-a-browser note) instead of
 * offering a share that would throw "not implemented".
 */
export function canShareDocument(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the generated PDF.'));
    reader.onload = () => {
      const result = String(reader.result);
      // readAsDataURL gives "data:application/pdf;base64,AAAA…" — Filesystem
      // wants the payload on its own.
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Render a generated HTML document to a PDF and open the system share sheet
 * for it, so the invoice can go to Files, email, or a printer.
 *
 * The PDF is written to the cache directory: it is a copy for sending on, not
 * app state, and the OS is free to reclaim it.
 *
 * Resolves quietly when the user dismisses the share sheet — a cancel is a
 * choice, not a failure. Throws if the PDF could not be produced or written.
 */
export async function shareDocumentAsPdf(html: string, filename: string, title: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;

  const blob = await html2pdf()
    .set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(documentToPdfFragment(html))
    .outputPdf('blob');

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });

  try {
    await Share.share({ title, files: [uri], dialogTitle: title });
  } catch (err) {
    // The Android and iOS share sheets both reject on dismissal.
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return;
    throw err;
  }
}
