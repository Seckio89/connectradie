// escapeHtml guards the print/PDF/email HTML-string generators, which build
// markup by string concatenation and then hand it to document.write / innerHTML.
// There is no React in that path, so this function is the only thing between a
// job title and script execution in the print window.

import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml — the five characters', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('Smith & Sons')).toBe('Smith &amp; Sons');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('escapes double quotes — attribute-context break-out', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single quotes as a numeric entity', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('escapes all five in one pass', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('escapeHtml — ordering', () => {
  // The reason & is replaced first: if < were replaced first, the & it
  // introduces would be re-escaped by the & rule and print as "&amp;lt;".
  it('does not double-encode the entities it just introduced', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  // Input that is ALREADY escaped gets escaped again — this is documented and
  // deliberate (see the doc comment: never pass React-rendered innerHTML in).
  it('escapes already-escaped input again, so callers must not pre-escape', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('is not idempotent — escaping twice differs from escaping once', () => {
    const once = escapeHtml('Tom & Jerry');
    expect(escapeHtml(once)).not.toBe(once);
  });
});

describe('escapeHtml — non-string input', () => {
  it('renders null and undefined as an empty string, not "null"/"undefined"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('stringifies numbers, including zero (?? only catches null/undefined)', () => {
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(1234.5)).toBe('1234.5');
  });

  it('stringifies booleans', () => {
    expect(escapeHtml(false)).toBe('false');
    expect(escapeHtml(true)).toBe('true');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Replace hot water unit — 250L')).toBe('Replace hot water unit — 250L');
  });
});

describe('escapeHtml — injection into a print document', () => {
  // The real attack: a client types a script tag into a job title, the tradie
  // prints the invoice, and document.write parses it as markup.
  it('neutralises a script tag so it cannot open a tag', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('a document built from escaped input parses as text, not as an element', () => {
    const doc = new DOMParser().parseFromString(
      `<div id="job">${escapeHtml('<img src=x onerror="alert(1)">')}</div>`,
      'text/html',
    );
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.getElementById('job')?.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('cannot break out of a double-quoted attribute', () => {
    const doc = new DOMParser().parseFromString(
      `<div title="${escapeHtml('" onmouseover="alert(1)')}"></div>`,
      'text/html',
    );
    const div = doc.querySelector('div');
    expect(div?.getAttribute('onmouseover')).toBeNull();
    expect(div?.getAttribute('title')).toBe('" onmouseover="alert(1)');
  });

  it('cannot break out of a single-quoted attribute', () => {
    const doc = new DOMParser().parseFromString(
      `<div title='${escapeHtml("' onmouseover='alert(1)")}'></div>`,
      'text/html',
    );
    const div = doc.querySelector('div');
    expect(div?.getAttribute('onmouseover')).toBeNull();
    expect(div?.getAttribute('title')).toBe("' onmouseover='alert(1)");
  });

  it('survives a nested/obfuscated tag attempt', () => {
    expect(escapeHtml('<scr<script>ipt>')).toBe('&lt;scr&lt;script&gt;ipt&gt;');
  });
});
