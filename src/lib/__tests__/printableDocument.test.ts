import { describe, it, expect } from 'vitest';
import { documentToPdfFragment, pdfSafe } from '../printableDocument';

// A cut-down copy of what the Leads.tsx invoice generators emit.
const DOC = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>INV-1 - Statement</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Roboto,sans-serif;max-width:680px;margin:0 auto;padding:40px 32px;font-size:14px}
.header{display:flex}
.bodycopy{color:#111}
@media print{body{padding:20px;margin:0}}
</style></head><body>
<div class="header">ConnecTradie</div>
</body></html>`;

describe('documentToPdfFragment', () => {
  const fragment = documentToPdfFragment(DOC);

  it('wraps the body content in the root element', () => {
    expect(fragment).toContain('<div class="pdf-root">');
    expect(fragment).toContain('<div class="header">ConnecTradie</div>');
  });

  it('drops the document shell html2pdf cannot use', () => {
    expect(fragment).not.toContain('<!DOCTYPE');
    expect(fragment).not.toContain('<body');
    expect(fragment).not.toContain('<title>');
  });

  it('rescopes body rules onto the root so the invoice keeps its layout', () => {
    expect(fragment).toContain('.pdf-root{font-family:Roboto,sans-serif;max-width:680px');
    // Nothing may still target the host page's body.
    expect(fragment).not.toMatch(/(^|[{},])\s*body\s*[,{]/);
  });

  it('rescopes body inside a media query too', () => {
    expect(fragment).toContain('@media print{.pdf-root{padding:20px;margin:0}}');
  });

  it('leaves class names that merely start with "body" alone', () => {
    expect(fragment).toContain('.bodycopy{color:#111}');
  });

  it('keeps the other rules, which are the generator\'s own', () => {
    expect(fragment).toContain('.header{display:flex}');
    expect(fragment).toContain('*{margin:0;padding:0;box-sizing:border-box}');
  });

  it('handles a grouped selector', () => {
    expect(documentToPdfFragment('<style>body,html{margin:0}</style><body>x</body>'))
      .toContain('.pdf-root,html{margin:0}');
  });

  it('falls back to the whole input when there is no body tag', () => {
    const fragment = documentToPdfFragment('<style>p{color:red}</style><p>Hi</p>');
    expect(fragment).toContain('<p>Hi</p>');
    // The style block is re-emitted once, not duplicated into the content.
    expect(fragment.match(/<style>/g)).toHaveLength(1);
  });
});

describe('pdfSafe', () => {
  it('passes a normal invoice reference through', () => {
    expect(pdfSafe('INV-20260807-A1B2')).toBe('INV-20260807-A1B2');
  });

  it('collapses characters a filesystem would choke on', () => {
    expect(pdfSafe('INV 1/2: draft')).toBe('INV-1-2-draft');
  });

  it('never returns an empty name', () => {
    expect(pdfSafe('///')).toBe('document');
  });
});
