// Trade-licence OCR parsing, pre-checks and register URL building — pure
// functions, no imports. Shared by extract-licence / submit-licence (Deno) and
// the frontend (src/lib/verification.ts re-exports it).
//
// SCOPE: NSW and QLD have per-state patterns; every other state falls back to
// the generic parser, and whatever it misses the tradie types in by hand. OCR
// never blocks onboarding — an empty parse is a valid outcome.

export type StateCode = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export const STATE_CODES: StateCode[] = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export interface ParsedLicence {
  licence_number: string | null;
  licence_holder_name: string | null;
  licence_class: string | null;
  /** ISO date YYYY-MM-DD */
  expiry_date: string | null;
  /** How many of the four fields were found, 0..1 */
  fields_found_ratio: number;
  /** Which parser produced this: 'NSW' | 'QLD' | 'generic' */
  parser: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Parse the date formats seen on Australian licence cards:
 *   31/12/2027 · 31-12-2027 · 31.12.2027 · 31 Dec 2027 · 31 DEC 27 · 2027-12-31
 * Returns YYYY-MM-DD or null. Two-digit years are assumed 20xx.
 */
export function parseAuDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return iso(m[3], m[2], m[1]);
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})\b/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mm) return iso(m[3], mm, m[1]);
  }
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mm) return iso(m[3], mm, m[2]);
  }
  return null;
}

function iso(y: string, mo: string, d: string): string | null {
  let year = Number(y);
  if (y.length === 2) year += 2000;
  const month = Number(mo);
  const day = Number(d);
  if (!(year >= 1990 && year <= 2100) || !(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Per-state patterns ──────────────────────────────────────────────────────
//
// Each pattern set is tried against the whole OCR text (case-insensitive,
// multi-line). Patterns name the card's own labels rather than assuming
// layout, because OCR line order is not stable.

interface StatePatterns {
  number: RegExp[];
  holder: RegExp[];
  klass: RegExp[];
  expiry: RegExp[];
}

const GENERIC: StatePatterns = {
  number: [
    /(?:licen[cs]e|registration|reg\.?|permit)\s*(?:no\.?|number|#|:)?\s*[:#]?\s*([A-Z]{0,4}\s?\d{3,9}[A-Z]?)/i,
    /\b(?:no\.?|number)\s*[:#]?\s*([A-Z]{0,4}\s?\d{4,9}[A-Z]?)\b/i,
  ],
  holder: [
    // Case-insensitive on the label; the value may be ALL CAPS, "Surname, Given"
    // or Title Case. Commas allowed between tokens for the "SMITH, JOHN" form;
    // tokens must stay on ONE line or the next label gets swallowed into the name.
    /(?:holder|name|licensee|licencee|practitioner)\s*[:-]?\s*\n?\s*([A-Za-z][A-Za-z'-]+(?:,?[ \t]+[A-Za-z][A-Za-z'-]+){1,3})/i,
  ],
  klass: [
    /(?:class|category|categories|type|licen[cs]e\s+type|endorsement|authori[sz]ed\s+work)\s*[:-]?\s*\n?\s*([A-Za-z][A-Za-z &/,()-]{2,60})/i,
  ],
  expiry: [
    /(?:expir(?:y|es)|valid\s+(?:to|until)|exp\.?)\s*(?:date)?\s*[:-]?\s*\n?\s*([0-9]{1,2}[/. -][A-Za-z0-9]{1,9}[/. -][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i,
  ],
};

// NSW Fair Trading contractor licence cards: "Licence No: 123456C", classes
// like "Plumber, Drainer, Gasfitter" or "Electrician", expiry "Expires:".
const NSW: StatePatterns = {
  number: [
    /(?:licen[cs]e|lic\.?)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d{4,7}[A-Z]{1,2})\b/i,
    /\b(\d{4,7}[CLSP])\b/,  // C = contractor, L = supervisor, S = tradesperson, P = provisional
    ...GENERIC.number,
  ],
  holder: GENERIC.holder,
  klass: [
    /(?:categor(?:y|ies)|class(?:es)?|licence\s+type)\s*[:-]?\s*\n?\s*([A-Za-z][A-Za-z &/,()-]{2,80})/i,
    ...GENERIC.klass,
  ],
  expiry: [
    /(?:expir(?:y|es)|expiry\s+date)\s*[:-]?\s*\n?\s*([0-9]{1,2}[/. -][A-Za-z0-9]{1,9}[/. -][0-9]{2,4})/i,
    ...GENERIC.expiry,
  ],
};

// QBCC licence cards: "Licence No. 1234567", class lines like "Plumbing and
// Drainage" / "Builder - Low Rise", expiry "Renewal Due" or "Expiry".
const QLD: StatePatterns = {
  number: [
    /(?:licen[cs]e|lic\.?|qbcc)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d{5,8})\b/i,
    ...GENERIC.number,
  ],
  holder: GENERIC.holder,
  klass: [
    /(?:licen[cs]e\s+class(?:es)?|class(?:es)?|scope\s+of\s+work)\s*[:-]?\s*\n?\s*([A-Za-z][A-Za-z &/,()-]{2,80})/i,
    ...GENERIC.klass,
  ],
  expiry: [
    /(?:renewal\s+due|expir(?:y|es)|valid\s+to)\s*(?:date)?\s*[:-]?\s*\n?\s*([0-9]{1,2}[/. -][A-Za-z0-9]{1,9}[/. -][0-9]{2,4})/i,
    ...GENERIC.expiry,
  ],
};

const PATTERNS: Partial<Record<StateCode, StatePatterns>> = { NSW, QLD };

function first(text: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

/** Parse OCR text for a given state. Unknown states use the generic parser. */
export function parseLicenceText(stateCode: string, text: string): ParsedLicence {
  const state = (stateCode ?? "").toUpperCase() as StateCode;
  const p = PATTERNS[state];
  const patterns = p ?? GENERIC;
  const parser = p ? state : "generic";
  const clean = (text ?? "").replace(/\r/g, "");

  const numberRaw = first(clean, patterns.number);
  const licence_number = numberRaw ? numberRaw.replace(/\s+/g, "").toUpperCase() : null;

  const holderRaw = first(clean, patterns.holder);
  const licence_holder_name = holderRaw ? tidyName(holderRaw) : null;

  const classRaw = first(clean, patterns.klass);
  const licence_class = classRaw ? classRaw.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim() : null;

  const expiryRaw = first(clean, patterns.expiry);
  const expiry_date = parseAuDate(expiryRaw);

  const found = [licence_number, licence_holder_name, licence_class, expiry_date].filter(Boolean).length;
  return { licence_number, licence_holder_name, licence_class, expiry_date, fields_found_ratio: found / 4, parser };
}

function tidyName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ── Pre-checks ──────────────────────────────────────────────────────────────

/**
 * Trade slug -> words that should appear in the licence class for it to count
 * as the right kind of licence. Slugs are TRADE_CATEGORIES values.
 */
export const LICENCE_CLASS_KEYWORDS: Record<string, string[]> = {
  plumber: ["plumb", "drain", "gasfit", "gas fit", "water"],
  "hot-water-service": ["plumb", "gasfit", "gas fit", "water"],
  electrician: ["electric", "electrical", "electrician"],
  solar: ["electric", "solar", "photovoltaic"],
  security: ["security", "electric", "alarm"],
  builder: ["build", "construct", "general building", "low rise", "medium rise", "open"],
  "bathroom-renovator": ["build", "bathroom", "kitchen", "laundry", "renovation", "wet area"],
  "kitchen-renovator": ["build", "bathroom", "kitchen", "laundry", "renovation", "joiner"],
  roofer: ["roof", "roofing", "roof tiling", "roof plumb", "build"],
  bricklayer: ["brick", "block", "masonry", "build"],
  waterproofing: ["waterproof", "build"],
  "pool-builder": ["pool", "swimming", "build"],
  demolition: ["demoli", "asbestos", "build"],
  scaffolder: ["scaffold", "rigging", "high risk"],
  "air-conditioning": ["air con", "air-con", "aircon", "refrigerat", "mechanical services", "arctick", "electric"],
  hvac: ["air con", "air-con", "aircon", "refrigerat", "mechanical services", "heating", "ventilation"],
  "pest-control": ["pest", "pesticide", "fumigat", "termite"],
  arborist: ["arbor", "tree"],
  "fire-safety": ["fire", "electric", "plumb"],
};

export interface PrecheckInput {
  expiry_date: string | null | undefined;         // YYYY-MM-DD
  licence_holder_name: string | null | undefined;
  /** Names the holder may legitimately appear as: profile full name, ABR entity name, business names */
  candidate_names: Array<string | null | undefined>;
  licence_class: string | null | undefined;
  trade_category: string;
  /** Injectable for tests; defaults to today (UTC). */
  today?: string;
}

export interface PrecheckResult {
  precheck_expiry_ok: boolean | null;
  precheck_name_match: boolean | null;
  precheck_class_match: boolean | null;
}

/** Sørensen–Dice similarity on lower-cased letter bigrams. 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    const t = s.replace(/ /g, "");
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const bx = bigrams(x), by = bigrams(y);
  let inter = 0;
  for (const [g, n] of bx) inter += Math.min(n, by.get(g) ?? 0);
  const total = [...bx.values()].reduce((a, b) => a + b, 0) + [...by.values()].reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : (2 * inter) / total;
}

/**
 * Fuzzy holder-name match: the licence usually shows "SMITH JOHN" or
 * "John A Smith" while the profile says "John Smith". Match when all tokens of
 * the shorter name appear in the longer, or Dice similarity >= 0.8.
 */
export function holderNameMatches(holder: string, candidates: Array<string | null | undefined>): boolean {
  const tokens = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1);
  const h = tokens(holder);
  if (h.length === 0) return false;
  for (const c of candidates) {
    if (!c) continue;
    const ct = tokens(c);
    if (ct.length === 0) continue;
    const [small, big] = h.length <= ct.length ? [h, ct] : [ct, h];
    if (small.every((t) => big.includes(t))) return true;
    if (nameSimilarity(holder, c) >= 0.8) return true;
  }
  return false;
}

/** Does the licence class read like a licence for this trade? Unknown trade -> null (not checked). */
export function licenceClassMatchesTrade(licenceClass: string, tradeCategory: string): boolean | null {
  const keywords = LICENCE_CLASS_KEYWORDS[tradeCategory];
  if (!keywords) return null;
  const c = licenceClass.toLowerCase();
  return keywords.some((k) => c.includes(k));
}

export function runPrechecks(input: PrecheckInput): PrecheckResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const precheck_expiry_ok = input.expiry_date ? input.expiry_date > today : null;
  const precheck_name_match = input.licence_holder_name
    ? holderNameMatches(input.licence_holder_name, input.candidate_names)
    : null;
  const precheck_class_match = input.licence_class
    ? licenceClassMatchesTrade(input.licence_class, input.trade_category)
    : null;
  return { precheck_expiry_ok, precheck_name_match, precheck_class_match };
}

// ── Register URL ────────────────────────────────────────────────────────────

/**
 * Substitute {{licence_number}} (URL-encoded). A template with no placeholder
 * is a landing page and comes back unchanged.
 */
export function buildRegisterUrl(template: string, licenceNumber: string | null | undefined): string {
  return template.replace(/\{\{\s*licence_number\s*\}\}/g, encodeURIComponent(licenceNumber ?? ""));
}

export function templateHasDeepLink(template: string): boolean {
  return /\{\{\s*licence_number\s*\}\}/.test(template);
}
