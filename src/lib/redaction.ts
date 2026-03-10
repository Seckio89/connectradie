// ── Number word mapping ──
const NUMBER_WORDS = new Set([
  'zero', 'oh', 'one', 'two', 'three', 'four', 'for', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
]);

// ── Intent phrases that signal contact sharing ──
const INTENT_PATTERNS = [
  /\b(call|ring|text|message|msg|contact|reach|hit)\s+(me|us)\b/i,
  /\b(email|e-mail|mail)\s+(me|us)\s*(at|on)?\b/i,
  /\bmy\s+(number|phone|mobile|cell|email|e-mail)\b/i,
  /\b(phone|mobile|cell)\s*(number|no|#)?\s*(is|:)\b/i,
  /\bget\s+(in\s+)?touch\b/i,
  /\b(dm|direct\s+message)\s+me\b/i,
  /\bwhatsapp\s+me\b/i,
  /\bfind\s+me\s+on\b/i,
];

// ── Common email domains ──
const EMAIL_DOMAINS = [
  'gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'protonmail',
  'live', 'msn', 'aol', 'mail', 'zoho', 'fastmail',
];

/**
 * Normalizes text for detection: collapses newlines to spaces,
 * strips separators between single digits (0/4/4/2 → 0442).
 * Used for detection only — the original text is preserved for display.
 */
function normalizeForDetection(text: string): string {
  let normalized = text;
  // Collapse newlines and excess whitespace to single spaces
  normalized = normalized.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  return normalized;
}

/**
 * Extracts a digit string from separator-split digits like "0/4/4/2/0/0/7/6/5/4" or "0.4.4.2.0.0.7.6.5.4"
 */
function extractSeparatedDigits(text: string): string | null {
  // Match 4+ single digits separated by the same non-alphanumeric char (/ . - , | etc.)
  const match = text.match(/\d\s*[/.\-,|\\]\s*\d(?:\s*[/.\-,|\\]\s*\d){2,}/g);
  if (match) {
    return match[0].replace(/[^0-9]/g, '');
  }
  return null;
}

/**
 * Detects digits separated by slashes, dots, dashes etc. (e.g., "0/4/4/2/0/0/7/6/5/4")
 */
function detectSeparatedDigits(text: string): boolean {
  const digits = extractSeparatedDigits(text);
  return digits !== null && digits.length >= 4;
}

/**
 * Redacts separator-split digit sequences
 */
function redactSeparatedDigits(text: string): string {
  return text.replace(
    /\d\s*[/.\-,|\\]\s*\d(?:\s*[/.\-,|\\]\s*\d){2,}/g,
    '[phone number hidden]'
  );
}

/**
 * Detects @ symbol or email domain keywords even when split across lines
 */
function detectEmailBypass(text: string): boolean {
  const normalized = normalizeForDetection(text);
  // Standard email
  if (/\b[\w.-]+\s*@\s*[\w.-]+\.\s*\w{2,}\b/i.test(normalized)) return true;
  // @ symbol near domain-like text
  if (/@\s*[\w.-]*\.\s*(com|net|org|io|au|co)\b/i.test(normalized)) return true;
  // Known email domains with @ nearby
  const domainPattern = new RegExp(`@\\s*(${EMAIL_DOMAINS.join('|')})`, 'i');
  if (domainPattern.test(normalized)) return true;
  // Standalone .com/.net/.org near @ or "email" keyword
  if (/\b(email|e-mail|mail)\b/i.test(normalized) && /\.\s*(com|net|org|io|au|co)\b/i.test(normalized)) return true;
  return false;
}

/**
 * Redacts email patterns including multi-line splits
 */
function redactEmailPatterns(text: string): string {
  let redacted = text;
  // Standard single-line emails
  redacted = redacted.replace(/\b([\w.-]+)@([\w.-]+\.\w{2,})\b/gi, '[email hidden]');
  // Email with spaces around @
  redacted = redacted.replace(/\b([\w.-]+)\s*@\s*([\w.-]+)\s*\.\s*(\w{2,})\b/gi, '[email hidden]');
  // Multi-line email: handle "name\n@domain.com" or "name@\ndomain.com"
  redacted = redacted.replace(/([\w.-]+)\s*\n\s*@\s*([\w.-]+\.\w{2,})/gi, '[email hidden]');
  redacted = redacted.replace(/([\w.-]+)\s*@\s*\n\s*([\w.-]+\.\w{2,})/gi, '[email hidden]');
  // Handle fully split email: "name\ndomain\n@domain.com" patterns
  redacted = redacted.replace(/([\w.-]+)\s*\n\s*([\w.-]*)\s*\n\s*@\s*([\w.-]+\.\w{2,})/gi, '[email hidden]');
  return redacted;
}

/**
 * Detects 4+ sequential number-words (e.g., "zero one one three seven eight nine")
 */
function detectSequentialNumberWords(text: string): boolean {
  const normalized = normalizeForDetection(text);
  const words = normalized.toLowerCase().split(/\s+/);
  let consecutive = 0;
  for (const word of words) {
    if (NUMBER_WORDS.has(word.replace(/[^a-z]/g, ''))) {
      consecutive++;
      if (consecutive >= 4) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

/**
 * Replaces sequences of 4+ number words with redaction marker
 */
function redactSequentialNumberWords(text: string): string {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let buffer: string[] = [];

  for (const word of words) {
    if (NUMBER_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''))) {
      buffer.push(word);
    } else {
      if (buffer.length >= 4) {
        result.push('[phone number hidden]');
      } else {
        result.push(...buffer);
      }
      buffer = [];
      result.push(word);
    }
  }
  if (buffer.length >= 4) {
    result.push('[phone number hidden]');
  } else {
    result.push(...buffer);
  }

  return result.join(' ');
}

/**
 * Detects mixed digit + number-word sequences (e.g., "zero one one three 7 8 9 0 1")
 */
function detectMixedNumberSequence(text: string): boolean {
  const normalized = normalizeForDetection(text);
  const words = normalized.toLowerCase().split(/\s+/);
  let consecutive = 0;
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (NUMBER_WORDS.has(clean) || /^\d{1,2}$/.test(clean)) {
      consecutive++;
      if (consecutive >= 4) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

/**
 * Redacts mixed digit + number-word sequences
 */
function redactMixedNumberSequence(text: string): string {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let buffer: string[] = [];

  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (NUMBER_WORDS.has(clean) || /^\d{1,2}$/.test(clean)) {
      buffer.push(word);
    } else {
      if (buffer.length >= 4) {
        result.push('[phone number hidden]');
      } else {
        result.push(...buffer);
      }
      buffer = [];
      result.push(word);
    }
  }
  if (buffer.length >= 4) {
    result.push('[phone number hidden]');
  } else {
    result.push(...buffer);
  }

  return result.join(' ');
}

// ── Main redaction function ──
export function redactContactInfo(text: string): string {
  if (!text.trim()) return text;
  let redacted = text;

  // Standard digit-based phone patterns (AU)
  redacted = redacted.replace(/\b(04\d{2})\s*(\d{3})\s*(\d{3})\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(04\d{8})\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\+61\s*4\d{2}\s*\d{3}\s*\d{3}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\+614\d{8}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\(0(\d)\)\s*\d{4}\s*\d{4}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(0[2-8])\s*\d{4}\s*\d{4}\b/gi, '[phone number hidden]');
  redacted = redacted.replace(/\b(0[2-8]\d{8})\b/gi, '[phone number hidden]');

  // Separator-split digits (0/4/4/2/0/0/7/6/5/4)
  redacted = redactSeparatedDigits(redacted);

  // Email patterns including multi-line splits
  redacted = redactEmailPatterns(redacted);

  // Spelled-out number sequences (4+ in a row)
  redacted = redactSequentialNumberWords(redacted);

  // Mixed digit + word sequences (e.g., "zero one one three 7 8 9 0 1")
  redacted = redactMixedNumberSequence(redacted);

  return redacted;
}

// ── Detection functions (for real-time UI warnings) ──

export type ContactDetection = {
  hasContact: boolean;
  hasDigitPhone: boolean;
  hasEmail: boolean;
  hasSpelledNumber: boolean;
  hasMixedNumber: boolean;
  hasIntentPhrase: boolean;
  hasSeparatedDigits: boolean;
  hasEmailBypass: boolean;
};

/**
 * Detects potential contact info without modifying the text.
 * Normalizes multi-line text for cross-line detection.
 */
export function detectContactInfo(text: string): ContactDetection {
  const normalized = normalizeForDetection(text);

  const hasDigitPhone =
    /\b04\d{2}\s*\d{3}\s*\d{3}\b/i.test(normalized) ||
    /\b04\d{8}\b/i.test(normalized) ||
    /\+61\s*4\d{2}\s*\d{3}\s*\d{3}\b/i.test(normalized) ||
    /\(0\d\)\s*\d{4}\s*\d{4}\b/i.test(normalized) ||
    /\b0[2-8]\s*\d{4}\s*\d{4}\b/i.test(normalized);

  const hasEmail = /\b[\w.-]+\s*@\s*[\w.-]+\.\w{2,}\b/i.test(normalized);
  const hasSpelledNumber = detectSequentialNumberWords(text);
  const hasMixedNumber = detectMixedNumberSequence(text);
  const hasIntentPhrase = INTENT_PATTERNS.some(p => p.test(normalized));
  const hasSeparatedDigits = detectSeparatedDigits(text);
  const hasEmailBypass = detectEmailBypass(text);

  const hasContact = hasDigitPhone || hasEmail || hasSpelledNumber || hasMixedNumber
    || hasIntentPhrase || hasSeparatedDigits || hasEmailBypass;

  return {
    hasContact,
    hasDigitPhone,
    hasEmail,
    hasSpelledNumber,
    hasMixedNumber,
    hasIntentPhrase,
    hasSeparatedDigits,
    hasEmailBypass,
  };
}

/**
 * Returns a user-friendly warning message based on what was detected.
 */
export function getContactWarningMessage(detection: ContactDetection): string | null {
  if (!detection.hasContact) return null;

  if (detection.hasDigitPhone || detection.hasSpelledNumber || detection.hasMixedNumber || detection.hasSeparatedDigits) {
    return 'It looks like your description contains a phone number. Contact details are automatically removed to keep you safe — tradies will contact you through the platform once you accept a quote.';
  }
  if (detection.hasEmail || detection.hasEmailBypass) {
    return 'It looks like your description contains an email address. Contact details are automatically removed — tradies will contact you through the platform.';
  }
  if (detection.hasIntentPhrase) {
    return 'It looks like you\'re trying to share contact details. For your safety, all communication happens through ConnecTradie until you accept a quote.';
  }
  return null;
}

export function redactSensitiveInfo(text: string, isUnlocked: boolean): string {
  if (isUnlocked) {
    return text;
  }
  return redactContactInfo(text);
}

export function shouldAllowContactSharing(
  messages: { sender_id: string }[],
  participantIds: [string, string]
): boolean {
  const [idA, idB] = participantIds;
  const aSent = messages.some((m) => m.sender_id === idA);
  const bSent = messages.some((m) => m.sender_id === idB);
  return aSent && bSent;
}
