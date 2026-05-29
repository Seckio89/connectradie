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

// ── Address redaction ──
const STREET_TYPES = [
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'drive', 'dr', 'place', 'pl',
  'court', 'ct', 'crescent', 'cres', 'parade', 'pde', 'terrace', 'tce',
  'lane', 'ln', 'way', 'circuit', 'cct', 'boulevard', 'blvd', 'highway', 'hwy',
  'close', 'cl', 'grove', 'gr', 'mews', 'rise', 'loop', 'track',
];
const STREET_PATTERN = new RegExp(
  `\\b(\\d{1,5}[a-z]?(?:\\/\\d{1,5})?)\\s+([a-z][a-z\\s]{1,30})\\b(${STREET_TYPES.join('|')})\\b[.,]?\\s*([a-z\\s]{2,25})?`,
  'gi'
);

function redactAddresses(text: string): string {
  return text.replace(STREET_PATTERN, '[address shared after job is confirmed]');
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

  // Street addresses (e.g., "6 spring garden street", "123 Smith Ave", "45/12 Jones Rd")
  redacted = redactAddresses(redacted);

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
  hasAddress: boolean;
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
  const hasAddress = STREET_PATTERN.test(text);
  // Reset regex lastIndex since it has the global flag
  STREET_PATTERN.lastIndex = 0;

  const hasContact = hasDigitPhone || hasEmail || hasSpelledNumber || hasMixedNumber
    || hasIntentPhrase || hasSeparatedDigits || hasEmailBypass || hasAddress;

  return {
    hasContact,
    hasDigitPhone,
    hasEmail,
    hasSpelledNumber,
    hasMixedNumber,
    hasIntentPhrase,
    hasSeparatedDigits,
    hasEmailBypass,
    hasAddress,
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

/**
 * Checks if a short message is a strong email-signal fragment.
 * Only matches things that are clearly email-related, NOT normal conversation words.
 */
function isEmailSignal(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // @ symbol (alone or with surrounding text like "@gmail")
  if (lower.includes('@')) return true;
  // Known email domains exactly ("gmail", "hotmail", etc.)
  if (EMAIL_DOMAINS.some(d => lower === d)) return true;
  // Common TLDs with or without leading dot (".com", "com", ".au", ".co.uk")
  if (/^\.?(com|net|org|io|au|co|edu|gov|info|biz|com\.au|co\.uk)$/i.test(lower)) return true;
  // A dot by itself
  if (lower === '.') return true;
  // "at" used as @ substitute — only exact match
  if (lower === 'at') return true;
  // "dot" used as . substitute — only exact match
  if (lower === 'dot') return true;
  return false;
}

/**
 * Checks if a message could be part of a contact info sequence.
 * Used only in Pass 3 to collect runs of fragments from the same sender.
 * A fragment is either a strong email signal OR a short token (no spaces, <= 20 chars)
 * that appears AFTER at least one strong signal in the run.
 */
function isEmailFragment(text: string, hasSeenSignal: boolean): boolean {
  if (isEmailSignal(text)) return true;
  // Only allow generic short tokens if we already have a strong signal in the run
  // (prevents "hi", "thanks", "ok" from starting a fragment run)
  if (hasSeenSignal && /^[\w.-]{1,20}$/.test(text.trim()) && !text.trim().includes(' ')) return true;
  return false;
}

/**
 * Detects cross-message contact info bypass where a user sends individual
 * digits, number words, or email fragments as separate messages.
 * Returns a Set of message IDs that should be redacted.
 */
export function detectCrossMessageDigitBypass(
  messages: { id: string; sender_id: string; content: string }[]
): Set<string> {
  const redactedIds = new Set<string>();

  // ── Pass 1: Consecutive digit messages (phone numbers) ──
  let i = 0;
  while (i < messages.length) {
    const sender = messages[i].sender_id;
    const content = messages[i].content.trim();

    if (/^\d{1,2}$/.test(content)) {
      const digitRun: number[] = [i];
      let j = i + 1;
      while (j < messages.length) {
        const nextContent = messages[j].content.trim();
        if (messages[j].sender_id === sender && /^\d{1,2}$/.test(nextContent)) {
          digitRun.push(j);
          j++;
        } else {
          break;
        }
      }

      if (digitRun.length >= 4) {
        for (const idx of digitRun) {
          redactedIds.add(messages[idx].id);
        }
      }

      i = j;
    } else {
      i++;
    }
  }

  // ── Pass 2: Number-word messages ("zero", "four", mixed with digits) ──
  i = 0;
  while (i < messages.length) {
    const sender = messages[i].sender_id;
    const content = messages[i].content.trim().toLowerCase();

    if (/^\d{1,2}$/.test(content) || NUMBER_WORDS.has(content.replace(/[^a-z]/g, ''))) {
      const wordRun: number[] = [i];
      let j = i + 1;
      while (j < messages.length) {
        const nextContent = messages[j].content.trim().toLowerCase();
        if (
          messages[j].sender_id === sender &&
          (/^\d{1,2}$/.test(nextContent) || NUMBER_WORDS.has(nextContent.replace(/[^a-z]/g, '')))
        ) {
          wordRun.push(j);
          j++;
        } else {
          break;
        }
      }

      if (wordRun.length >= 4) {
        for (const idx of wordRun) {
          redactedIds.add(messages[idx].id);
        }
      }

      i = j;
    } else {
      i++;
    }
  }

  // ── Pass 3: Cross-message email detection ──
  // Only starts collecting when a STRONG email signal is seen (@ , domain, TLD, "at", "dot").
  // Generic short words ("hi", "ok", "thanks") can NOT start a fragment run.
  i = 0;
  while (i < messages.length) {
    const sender = messages[i].sender_id;
    const content = messages[i].content.trim();

    // A run must START with a strong email signal
    if (content.length <= 30 && isEmailSignal(content)) {
      let hasSeenSignal = true;
      const fragmentRun: number[] = [i];
      let j = i + 1;
      while (j < messages.length) {
        const nextContent = messages[j].content.trim();
        if (
          messages[j].sender_id === sender &&
          nextContent.length <= 30 &&
          isEmailFragment(nextContent, hasSeenSignal)
        ) {
          if (isEmailSignal(nextContent)) hasSeenSignal = true;
          fragmentRun.push(j);
          j++;
        } else {
          break;
        }
      }

      // Also look backwards — the signal might be in the middle (e.g., "john", "@", "gmail")
      // Expand backwards to include short tokens from the same sender before the signal
      let k = i - 1;
      while (k >= 0 && !redactedIds.has(messages[k].id)) {
        const prevContent = messages[k].content.trim();
        if (
          messages[k].sender_id === sender &&
          prevContent.length <= 20 &&
          /^[\w.-]{1,20}$/.test(prevContent)
        ) {
          fragmentRun.unshift(k);
          k--;
        } else {
          break;
        }
      }

      // Check if the combined fragments form an email-like pattern
      if (fragmentRun.length >= 2) {
        const combined = fragmentRun.map(idx => messages[idx].content.trim()).join('');
        const combinedSpaced = fragmentRun.map(idx => messages[idx].content.trim()).join(' ');

        const looksLikeEmail =
          // Contains @ and a dot after it (standard email shape)
          /[\w.-]+@[\w.-]+\.\w{2,}/i.test(combined) ||
          /[\w.-]+\s*@\s*[\w.-]+\s*\.\s*\w{2,}/i.test(combinedSpaced) ||
          // Contains @ and a known domain
          (combined.includes('@') && EMAIL_DOMAINS.some(d => combined.toLowerCase().includes(d))) ||
          // Contains "at" word + known domain (e.g., "john", "at", "gmail", "dot", "com")
          (/\bat\b/i.test(combinedSpaced) && EMAIL_DOMAINS.some(d => combinedSpaced.toLowerCase().includes(d))) ||
          // Contains "at" + "dot" pattern (spoken email)
          (/\bat\b/i.test(combinedSpaced) && /\bdot\b/i.test(combinedSpaced));

        if (looksLikeEmail) {
          for (const idx of fragmentRun) {
            redactedIds.add(messages[idx].id);
          }
        }
      }

      i = j;
    } else {
      i++;
    }
  }

  // ── Pass 4: Sliding window — concatenate recent short messages and detect ──
  // Catches cases where email parts are mixed with normal-length fragments
  for (i = 0; i < messages.length; i++) {
    const sender = messages[i].sender_id;
    // Build a window of up to 8 consecutive messages from the same sender
    const window: number[] = [];
    for (let k = i; k < messages.length && k < i + 8; k++) {
      if (messages[k].sender_id !== sender) break;
      if (messages[k].content.trim().length > 50) break; // skip long messages
      window.push(k);
    }

    if (window.length >= 2) {
      const combined = window.map(idx => messages[idx].content.trim()).join('');
      // Check if combined text contains a phone number or email
      const hasPhone =
        /04\d{8}/i.test(combined) ||
        /0[2-8]\d{8}/i.test(combined) ||
        /\+614\d{8}/i.test(combined);
      const hasEmail = /[\w.-]+@[\w.-]+\.\w{2,}/i.test(combined);

      if (hasPhone || hasEmail) {
        for (const idx of window) {
          redactedIds.add(messages[idx].id);
        }
      }
    }
  }

  return redactedIds;
}
