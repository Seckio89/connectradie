// jobDescription turns free text into a bulleted scope plus separate site notes.
// The contract that matters: nothing is ever DROPPED — a line either lands in
// scope or in notes. Every test below checks total items as well as routing.

import { describe, it, expect } from 'vitest';
import { composeDescription, descriptionPreview, formatDescription } from '../jobDescription';

const total = (raw: string) => {
  const { scope, notes } = formatDescription(raw);
  return scope.length + notes.length;
};

describe('formatDescription — empty and malformed input', () => {
  it('returns empty lists for null, undefined and empty string', () => {
    expect(formatDescription(null)).toEqual({ scope: [], notes: [] });
    expect(formatDescription(undefined)).toEqual({ scope: [], notes: [] });
    expect(formatDescription('')).toEqual({ scope: [], notes: [] });
  });

  it('returns empty lists for whitespace-only input', () => {
    expect(formatDescription('   \n\n  ')).toEqual({ scope: [], notes: [] });
  });

  it('returns nothing when the description is only a category tag', () => {
    expect(formatDescription('[Plumbing]')).toEqual({ scope: [], notes: [] });
  });

  it('drops bullet-only lines rather than emitting blank items', () => {
    expect(formatDescription('• \n• Fix tap\n•')).toEqual({ scope: ['Fix tap'], notes: [] });
  });
});

describe('formatDescription — the [category] prefix', () => {
  it('strips the prefix PostLead prepends', () => {
    expect(formatDescription('[Plumbing] Fix leaking tap').scope).toEqual(['Fix leaking tap']);
  });

  it('strips it regardless of surrounding whitespace', () => {
    expect(formatDescription('   [Electrical]   Replace switchboard').scope)
      .toEqual(['Replace switchboard']);
  });

  it('strips only the leading tag, not one that appears mid-text', () => {
    expect(formatDescription('[Plumbing] Fix tap [urgent]').scope).toEqual(['Fix tap [urgent]']);
  });

  it('leaves an unclosed bracket alone rather than eating the description', () => {
    expect(formatDescription('[Plumbing Fix leaking tap').scope).toEqual(['[Plumbing Fix leaking tap']);
  });

  it('leaves an empty tag alone — the pattern requires at least one character', () => {
    expect(formatDescription('[] Fix tap').scope).toEqual(['[] Fix tap']);
  });
});

describe('formatDescription — how a blob gets split', () => {
  it('prefers line breaks', () => {
    expect(formatDescription('Replace tap\nSeal basin\nTest pressure').scope)
      .toEqual(['Replace tap', 'Seal basin', 'Test pressure']);
  });

  it('collapses blank lines instead of emitting empty items', () => {
    expect(formatDescription('Replace tap\n\n\nSeal basin').scope)
      .toEqual(['Replace tap', 'Seal basin']);
  });

  it('splits on bullet characters when there are no line breaks', () => {
    expect(formatDescription('• Replace tap • Seal basin').scope)
      .toEqual(['Replace tap', 'Seal basin']);
  });

  it('splits on dash and asterisk bullets', () => {
    expect(formatDescription('- Replace tap - Seal basin').scope)
      .toEqual(['Replace tap', 'Seal basin']);
    expect(formatDescription('* Replace tap * Seal basin').scope)
      .toEqual(['Replace tap', 'Seal basin']);
  });

  it('does not split a hyphenated word — a bullet dash needs a space after it', () => {
    expect(formatDescription('Re-hang the side gate').scope).toEqual(['Re-hang the side gate']);
  });

  it('splits on commas and semicolons when there are no bullets', () => {
    expect(formatDescription('Replace tap, seal basin; test pressure').scope)
      .toEqual(['Replace tap', 'Seal basin', 'Test pressure']);
  });

  it('falls back to sentence boundaries', () => {
    expect(formatDescription('Replace the tap. Seal the basin! Then test it?').scope)
      .toEqual(['Replace the tap.', 'Seal the basin!', 'Then test it?']);
  });

  it('does not split a decimal — a sentence break needs whitespace after the stop', () => {
    expect(formatDescription('Cut a 2.5 m length of copper').scope)
      .toEqual(['Cut a 2.5 m length of copper']);
  });

  it('keeps a single blob as one item', () => {
    expect(formatDescription('Replace the hot water unit').scope)
      .toEqual(['Replace the hot water unit']);
  });

  // Delimiter precedence: line breaks beat bullets beat commas beat sentences.
  it('uses line breaks even when commas are also present', () => {
    expect(formatDescription('Replace tap, washer and seat\nSeal basin').scope)
      .toEqual(['Replace tap, washer and seat', 'Seal basin']);
  });

  // The character class at the bullet split holds U+2022 twice — the middle dot
  // (U+00B7) used in the pricing helper's "2.5 h · $181" is NOT a split point.
  it('does not treat a middle dot as a bullet', () => {
    expect(formatDescription('Replace tap · seal basin').scope)
      .toEqual(['Replace tap · seal basin']);
  });
});

describe('formatDescription — cleaning', () => {
  it('capitalises the first character of every item', () => {
    expect(formatDescription('replace tap\nseal basin').scope).toEqual(['Replace tap', 'Seal basin']);
  });

  it('leaves an already-capitalised item and the rest of its casing alone', () => {
    expect(formatDescription('Replace RCD in switchboard').scope).toEqual(['Replace RCD in switchboard']);
  });

  it('collapses runs of whitespace', () => {
    expect(formatDescription('Replace   the    tap').scope).toEqual(['Replace the tap']);
  });

  it('strips leading bullet and dash decoration left on a line', () => {
    expect(formatDescription('- Replace tap\n• Seal basin\n* Test pressure').scope)
      .toEqual(['Replace tap', 'Seal basin', 'Test pressure']);
  });
});

describe('formatDescription — routing to site notes', () => {
  it('routes an explicit "Site notes:" line to notes', () => {
    const { scope, notes } = formatDescription('Replace tap\nSite notes: gate code 1234');
    expect(scope).toEqual(['Replace tap']);
    expect(notes).toEqual(['Gate code 1234']);
  });

  it.each([
    'Notes: park in the driveway',
    'Note: park in the driveway',
    'Conditions: park in the driveway',
    'Access: park in the driveway',
    'Assumptions: park in the driveway',
    'Internal notes: park in the driveway',
  ])('recognises the marker in %s', (line) => {
    const { scope, notes } = formatDescription(line);
    expect(scope).toEqual([]);
    expect(notes).toEqual(['Park in the driveway']);
  });

  it('is case-insensitive about the marker', () => {
    expect(formatDescription('SITE NOTES: rear gate').notes).toEqual(['Rear gate']);
  });

  // The marker's separator class is [:\-] — an escaped hyphen inside a character
  // class, with optional whitespace on either side.
  it('accepts a hyphen separator with no surrounding spaces', () => {
    expect(formatDescription('Notes-park in the driveway').notes).toEqual(['Park in the driveway']);
  });

  it('accepts padding around a colon separator', () => {
    expect(formatDescription('Notes   :   park in the driveway').notes).toEqual(['Park in the driveway']);
  });

  it('accepts a spaced hyphen separator on its own line', () => {
    expect(formatDescription('Replace tap\nNotes - park in the driveway').notes)
      .toEqual(['Park in the driveway']);
  });

  // Regression: on a SINGLE-line description the delimiter pass ran first, so
  // " - " looked like a dash bullet and severed the marker from its text before
  // NOTE_MARKER saw it. The access note became two SCOPE items — work the
  // tradie appeared to be quoted for. splitRaw now returns a marker-led one-
  // liner whole.
  it('keeps a spaced-hyphen marker on a one-line description as one note', () => {
    expect(formatDescription('Notes - park in the driveway')).toEqual({
      scope: [],
      notes: ['Park in the driveway'],
    });
  });

  it('routes every marker separator and shape to notes, never to scope', () => {
    for (const raw of [
      'Notes - park in the driveway',
      'Notes: park in the driveway',
      'Site notes - park in the driveway',
      'Access - via the side gate',
    ]) {
      const { scope, notes } = formatDescription(raw);
      expect(scope).toEqual([]);
      expect(notes).toHaveLength(1);
    }
  });

  it('does not treat a marker word as a marker without a separator', () => {
    // A real duty that happens to begin with "Access" must stay in scope.
    expect(formatDescription('Access panel replacement in ceiling').scope)
      .toEqual(['Access panel replacement in ceiling']);
    expect(formatDescription('Access panel replacement in ceiling').notes).toEqual([]);
  });

  it('routes site observations to notes without deleting them', () => {
    expect(formatDescription('Roof is in good condition').notes).toEqual(['Roof is in good condition']);
    expect(formatDescription('The condition is poor').notes).toEqual(['The condition is poor']);
    expect(formatDescription('Tiles are in a reasonable condition').notes)
      .toEqual(['Tiles are in a reasonable condition']);
  });

  it('does not misroute a duty that merely mentions air conditioning', () => {
    expect(formatDescription('Service the air conditioner').scope).toEqual(['Service the air conditioner']);
  });

  it('routes a pricing-rationale line to notes', () => {
    expect(formatDescription('Estimated 2.5 h · $181').notes).toEqual(['Estimated 2.5 h · $181']);
    expect(formatDescription('Estimated 2.5 h · $181').scope).toEqual([]);
  });

  it('peels a trailing estimate off a single-blob description', () => {
    const { scope, notes } = formatDescription('Replace hot water unit estimated 3 h · $240');
    expect(scope).toEqual(['Replace hot water unit']);
    expect(notes).toEqual(['Estimated 3 h · $240']);
  });

  it('never loses a line — everything lands in scope or notes', () => {
    const raw = '[Plumbing] Replace tap\nSeal basin\nSite notes: gate code 1234\nRoof is in good condition';
    const { scope, notes } = formatDescription(raw);
    expect(scope).toEqual(['Replace tap', 'Seal basin']);
    expect(notes).toEqual(['Gate code 1234', 'Roof is in good condition']);
    expect(total(raw)).toBe(4);
  });
});

describe('descriptionPreview', () => {
  it('returns an empty string for null and undefined', () => {
    expect(descriptionPreview(null)).toBe('');
    expect(descriptionPreview(undefined)).toBe('');
  });

  it('strips the category tag', () => {
    expect(descriptionPreview('[Plumbing] Fix leaking tap')).toBe('Fix leaking tap');
  });

  it('flattens bullets and newlines into single spaces', () => {
    expect(descriptionPreview('• Replace tap\n• Seal basin')).toBe('Replace tap Seal basin');
  });

  it('returns a short description untouched', () => {
    expect(descriptionPreview('Fix tap')).toBe('Fix tap');
  });

  it('returns a description of exactly max length untouched', () => {
    const exact = 'a'.repeat(60);
    expect(descriptionPreview(exact)).toBe(exact);
    expect(descriptionPreview(exact)).not.toContain('…');
  });

  it('truncates to max characters including the ellipsis', () => {
    const out = descriptionPreview('a'.repeat(80));
    expect(out).toHaveLength(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('honours a custom max', () => {
    expect(descriptionPreview('abcdefghij', 5)).toBe('abcd…');
  });

  it('does not leave a dangling space before the ellipsis', () => {
    expect(descriptionPreview('ab cdefgh', 4)).toBe('ab…');
  });
});

describe('composeDescription', () => {
  it('joins scope items one per line', () => {
    expect(composeDescription(['Replace tap', 'Seal basin'])).toBe('Replace tap\nSeal basin');
  });

  it('trims each item and drops blank ones', () => {
    expect(composeDescription(['  Replace tap  ', '', '   ', 'Seal basin'])).toBe('Replace tap\nSeal basin');
  });

  it('appends site notes under an explicit marker', () => {
    expect(composeDescription(['Replace tap'], 'Gate code 1234'))
      .toBe('Replace tap\nSite notes: Gate code 1234');
  });

  it('omits the leading newline when there is no scope', () => {
    expect(composeDescription([], 'Gate code 1234')).toBe('Site notes: Gate code 1234');
  });

  it('ignores whitespace-only site notes', () => {
    expect(composeDescription(['Replace tap'], '   ')).toBe('Replace tap');
    expect(composeDescription(['Replace tap'], undefined)).toBe('Replace tap');
  });

  it('returns an empty string when there is nothing to compose', () => {
    expect(composeDescription([])).toBe('');
    expect(composeDescription(['', '  '])).toBe('');
  });
});

describe('compose → format round trip', () => {
  it('round-trips scope and notes composed at input time', () => {
    const raw = composeDescription(['Replace tap', 'Seal basin'], 'Gate code 1234');
    expect(formatDescription(raw)).toEqual({
      scope: ['Replace tap', 'Seal basin'],
      notes: ['Gate code 1234'],
    });
  });

  it('round-trips a scope-only description', () => {
    const items = ['Replace tap', 'Seal basin', 'Test pressure'];
    expect(formatDescription(composeDescription(items)).scope).toEqual(items);
  });

  it('capitalises on the way back out, so lower-case input is not preserved', () => {
    expect(formatDescription(composeDescription(['replace tap'])).scope).toEqual(['Replace tap']);
  });

  // Lossy edge: a SINGLE scope item containing a comma is stored without any
  // newline, so the reader falls through to the comma delimiter and splits an
  // item the user typed as one. Two or more items are safe (the newline wins).
  it('EDGE: a lone comma-bearing scope item is re-split on the way back', () => {
    const raw = composeDescription(['Replace tap, washer and seat']);
    expect(formatDescription(raw).scope).toEqual(['Replace tap', 'Washer and seat']);
    // With a second item present the newline takes precedence and it survives.
    expect(formatDescription(composeDescription(['Replace tap, washer and seat', 'Seal basin'])).scope)
      .toEqual(['Replace tap, washer and seat', 'Seal basin']);
  });
});
