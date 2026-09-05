// ABN checksum and business-name matching — pure functions, no imports.
//
// Shared by the verify-abn edge function (Deno) AND the frontend
// (src/lib/verification.ts re-exports it, the same way feeV21.test.ts imports
// _shared/pricing). Keep it dependency-free so both runtimes can load it.

/** ATO weighting factors — https://abr.business.gov.au/Help/AbnFormat */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

/** Strip everything that is not a digit. "51 824 753 556" -> "51824753556". */
export function normaliseAbn(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Official mod-89 checksum. Expects the NORMALISED 11-digit string; anything
 * else is invalid, including a formatted input — normalise first.
 */
export function isValidAbnChecksum(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, d, i) => acc + d * ABN_WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** "51824753556" -> "51 824 753 556" for display. Leaves partial input alone. */
export function formatAbn(input: string): string {
  const d = normaliseAbn(input).slice(0, 11);
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
}

// ── Name matching ───────────────────────────────────────────────────────────

/**
 * Corporate suffixes that vary in print but not in identity. Each entry is a
 * regex fragment matched as a whole trailing token after punctuation is gone.
 * "Pty. Ltd.", "Pty Ltd", "P/L", "PTY LIMITED" all collapse to nothing.
 */
const SUFFIX_PATTERNS: RegExp[] = [
  /\bproprietary limited\b/g,
  /\bpty limited\b/g,
  /\bpty ltd\b/g,
  /\bp\s*\/?\s*l\b/g,      // P/L, P L
  /\bpty\b/g,
  /\bltd\b/g,
  /\blimited\b/g,
  /\binc\b/g,
  /\bincorporated\b/g,
  /\bthe trustee for\b/g,  // ABR: "The Trustee for SMITH FAMILY TRUST"
  /\bthe\b/g,
];

/**
 * Lower-case, strip punctuation and common suffix variants, collapse spaces.
 * "Smith's Plumbing Pty. Ltd." and "SMITH PLUMBING P/L" both become
 * "smith plumbing".
 */
export function normaliseBusinessName(name: string): string {
  let s = (name ?? "").toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/['’`]/g, "");          // Smith's -> Smiths (handled below)
  s = s.replace(/[.,;:!?"()[\]{}_-]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // P/L keeps its slash until the suffix pass so the pattern can see it.
  for (const re of SUFFIX_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/\//g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Trailing possessive 's' left over from "Smith's": "smiths plumbing" vs
  // "smith plumbing" should match, so drop a single trailing s per token only
  // when that makes the token at least 3 chars.
  s = s
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    .join(" ");
  return s;
}

/**
 * True when the claimed name matches ANY candidate after normalisation.
 * Exact match after normalisation, or one is a token-subset of the other
 * (ABR often returns "SMITH, JOHN" as the entity and "Smith Plumbing" as a
 * registered business name; the tradie may type either).
 */
export function businessNameMatches(claimed: string, candidates: Array<string | null | undefined>): boolean {
  const c = normaliseBusinessName(claimed);
  if (!c) return false;
  const cTokens = new Set(c.split(" ").filter(Boolean));
  for (const raw of candidates) {
    if (!raw) continue;
    const n = normaliseBusinessName(raw);
    if (!n) continue;
    if (n === c) return true;
    const nTokens = new Set(n.split(" ").filter(Boolean));
    // Subset in either direction, but only for names with at least two tokens
    // on the shorter side — a single shared word like "plumbing" is not a match.
    const [small, big] = cTokens.size <= nTokens.size ? [cTokens, nTokens] : [nTokens, cTokens];
    if (small.size >= 2 && [...small].every((t) => big.has(t))) return true;
  }
  return false;
}

export type AbnVerificationStatus = "verified" | "review" | "failed";

/** Active + name match = verified; Active without match = review; else failed. */
export function classifyAbnResult(abnStatus: string | null | undefined, nameMatch: boolean): AbnVerificationStatus {
  if ((abnStatus ?? "").toLowerCase() !== "active") return "failed";
  return nameMatch ? "verified" : "review";
}
