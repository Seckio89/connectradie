// ─────────────────────────────────────────────────────────────────────────────
// jobDescription — turn a free-text job/quote description into clean, readable
// pieces: a bulleted SCOPE OF WORK (the duties) and separate SITE NOTES
// (conditions / access — not duties). Also a short preview for cards.
//
// New descriptions are composed clean at input time (checklist / one-per-line via
// composeDescription), so they render perfectly. Legacy free-text degrades
// gracefully: we split on the best delimiter available and route obvious
// site-observations into notes rather than deleting anything.
// ─────────────────────────────────────────────────────────────────────────────

// Explicit "Site notes:" / "Notes:" style prefixes (how composeDescription stores notes).
const NOTE_MARKER = /^(site notes?|notes?|conditions?|access)\s*[:\-]\s*/i;

// Narrow set of clear site-observations (conditions, not duties). Kept tight to
// avoid misrouting real tasks. Matched items go to notes, never dropped.
const OBSERVATION = /\bin (a |an )?(reasonable|good|fair|ok|okay|poor|decent|great|excellent) condition\b|\bcondition (is|are|was)\b/i;

export interface FormattedDescription {
  scope: string[];
  notes: string[];
}

function cleanItem(s: string): string {
  const t = s.replace(/^[\s••\-*]+/, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function splitRaw(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  // Prefer explicit line breaks.
  if (/\n/.test(text)) return text.split(/\n+/);
  // Then bullet characters.
  if (/[••]/.test(text) || /(^|\s)[-*]\s/.test(text)) {
    return text.split(/\s*[••]\s*|(?:^|\s)[-*]\s+/);
  }
  // Then commas / semicolons.
  if (/[,;]/.test(text)) return text.split(/\s*[,;]\s*/);
  // Then sentence boundaries.
  if (/[.!?]\s/.test(text)) return text.split(/(?<=[.!?])\s+/);
  // Otherwise a single blob — at least peel a trailing "Estimated …" onto its own line.
  const est = text.match(/^(.*?\S)\s+(estimated\b.*)$/i);
  if (est) return [est[1], est[2]];
  return [text];
}

// Strip the "[Category]" prefix that PostLead prepends to client-posted jobs.
const stripCategory = (s: string) => s.replace(/^\s*\[[^\]]+\]\s*/, '');

export function formatDescription(raw: string | null | undefined): FormattedDescription {
  const scope: string[] = [];
  const notes: string[] = [];
  if (!raw) return { scope, notes };
  for (const piece of splitRaw(stripCategory(raw))) {
    let item = piece;
    const marked = NOTE_MARKER.test(item.trim());
    if (marked) item = item.trim().replace(NOTE_MARKER, '');
    const cleaned = cleanItem(item);
    if (!cleaned) continue;
    if (marked || OBSERVATION.test(cleaned)) notes.push(cleaned);
    else scope.push(cleaned);
  }
  return { scope, notes };
}

/** Collapse a description to a short single-line preview for cards. */
export function descriptionPreview(raw: string | null | undefined, max = 60): string {
  if (!raw) return '';
  const oneLine = raw.replace(/^\s*\[[^\]]+\]\s*/, '').replace(/[••]/g, ' ').replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/** Compose a clean stored description from tick-list / typed scope items + optional site notes. */
export function composeDescription(scopeItems: string[], siteNotes?: string): string {
  const scope = scopeItems.map((s) => s.trim()).filter(Boolean);
  let out = scope.join('\n');
  const notes = (siteNotes || '').trim();
  if (notes) out += `${out ? '\n' : ''}Site notes: ${notes}`;
  return out;
}
