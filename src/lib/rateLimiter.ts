import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  max: number;
  windowMinutes: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface SpamCheckResult {
  isSpam: boolean;
  reasons: string[];
}

export interface FakeReviewCheck {
  suspicious: boolean;
  reasons: string[];
}

export interface ScrapingDetection {
  suspicious: boolean;
  severity: 'low' | 'medium' | 'high';
}

export interface AbuseReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  severity: string;
  description: string;
  status: string;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface AbuseReportFilters {
  status?: string;
  report_type?: string;
  severity?: string;
}

// ---------------------------------------------------------------------------
// Rate limit configuration
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  post_job: { max: 5, windowMinutes: 60 },
  send_quote: { max: 20, windowMinutes: 60 },
  send_message: { max: 50, windowMinutes: 60 },
  login_attempt: { max: 5, windowMinutes: 15 },
  search: { max: 30, windowMinutes: 60 },
} as const;

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const RATE_LIMIT_PREFIX = 'connectradie_rl_';

interface RateLimitEntry {
  timestamps: number[];
}

function getStorageKey(userId: string, action: string): string {
  return `${RATE_LIMIT_PREFIX}${userId}_${action}`;
}

function loadEntry(key: string): RateLimitEntry {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return { timestamps: [] };
    const parsed = JSON.parse(stored);
    return { timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [] };
  } catch {
    return { timestamps: [] };
  }
}

function saveEntry(key: string, entry: RateLimitEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Check whether an action is allowed under the current rate limit.
 * Uses localStorage to track request timestamps per user/action.
 *
 * If allowed, the current timestamp is recorded. If not allowed, the
 * timestamp is *not* recorded (only successful attempts count).
 */
export function checkRateLimit(userId: string, action: string): RateLimitResult {
  const config = RATE_LIMITS[action];
  if (!config) {
    // Unknown action — allow by default
    return { allowed: true, remaining: Infinity, resetAt: new Date() };
  }

  const key = getStorageKey(userId, action);
  const entry = loadEntry(key);

  const now = Date.now();
  const windowMs = config.windowMinutes * 60 * 1000;
  const windowStart = now - windowMs;

  // Prune timestamps outside the window
  const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const allowed = validTimestamps.length < config.max;
  const remaining = Math.max(0, config.max - validTimestamps.length - (allowed ? 1 : 0));

  // Calculate reset time (when the oldest timestamp expires)
  const resetAt = validTimestamps.length > 0
    ? new Date(validTimestamps[0] + windowMs)
    : new Date(now + windowMs);

  if (allowed) {
    validTimestamps.push(now);
  }

  saveEntry(key, { timestamps: validTimestamps });

  return { allowed, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Spam detection
// ---------------------------------------------------------------------------

const SPAM_KEYWORDS = [
  'buy now',
  'click here',
  'free money',
  'act now',
  'limited offer',
  'no obligation',
  'winner',
  'congratulations',
  'earn extra cash',
  'work from home',
  'double your income',
  'risk free',
  'call now',
  'order now',
  'apply now',
  'credit card',
  'as seen on',
  'multi-level marketing',
  'mlm',
  'bitcoin',
  'crypto',
];

/**
 * Check whether a piece of text looks like spam.
 *
 * Heuristics:
 * 1. More than 3 URLs.
 * 2. CAPS ratio above 50%.
 * 3. Contains known spam keywords.
 * 4. Character repeated more than 5 times consecutively.
 */
export function isSpamContent(text: string): SpamCheckResult {
  const reasons: string[] = [];

  // 1. URL count
  const urlMatches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  if (urlMatches.length > 3) {
    reasons.push(`Contains ${urlMatches.length} URLs (limit: 3)`);
  }

  // 2. CAPS ratio
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 10) {
    const capsRatio = (text.replace(/[^A-Z]/g, '').length) / letters.length;
    if (capsRatio > 0.5) {
      reasons.push(`Excessive capitalisation (${Math.round(capsRatio * 100)}%)`);
    }
  }

  // 3. Spam keywords
  const lowerText = text.toLowerCase();
  const foundKeywords = SPAM_KEYWORDS.filter((kw) => lowerText.includes(kw));
  if (foundKeywords.length > 0) {
    reasons.push(`Contains spam keywords: ${foundKeywords.join(', ')}`);
  }

  // 4. Repeated characters
  const repeatedMatch = text.match(/(.)\1{5,}/);
  if (repeatedMatch) {
    reasons.push(`Repeated character detected: "${repeatedMatch[0].slice(0, 8)}..."`);
  }

  return { isSpam: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Fake review detection
// ---------------------------------------------------------------------------

interface ReviewerInfo {
  created_at: string; // account creation date
}

interface ReviewInfo {
  created_at: string; // review submission date
  comment: string;
  job_completed_at: string;
  reviewer_reviews_today: number;
}

/**
 * Heuristic check for suspicious / fake reviews.
 *
 * Flags:
 * 1. Account age < 7 days.
 * 2. Review submitted within 1 hour of job completion.
 * 3. Reviewer has submitted > 5 reviews today.
 * 4. Review comment is less than 10 characters.
 */
export function isSuspiciousFakeReview(
  review: ReviewInfo,
  reviewer: ReviewerInfo,
): FakeReviewCheck {
  const reasons: string[] = [];

  // 1. Account age
  const accountAge = Date.now() - new Date(reviewer.created_at).getTime();
  const accountDays = accountAge / (1000 * 60 * 60 * 24);
  if (accountDays < 7) {
    reasons.push(`Account is only ${Math.round(accountDays)} day(s) old`);
  }

  // 2. Time since job completion
  const reviewTime = new Date(review.created_at).getTime();
  const completionTime = new Date(review.job_completed_at).getTime();
  const hoursSinceCompletion = (reviewTime - completionTime) / (1000 * 60 * 60);
  if (hoursSinceCompletion >= 0 && hoursSinceCompletion < 1) {
    reasons.push('Review submitted within 1 hour of job completion');
  }

  // 3. Review volume today
  if (review.reviewer_reviews_today > 5) {
    reasons.push(`Reviewer has submitted ${review.reviewer_reviews_today} reviews today`);
  }

  // 4. Very short comment
  if (review.comment.trim().length < 10) {
    reasons.push('Review comment is very short (< 10 characters)');
  }

  return { suspicious: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Contact scraping detection
// ---------------------------------------------------------------------------

/**
 * Detect suspicious contact-viewing patterns.
 *
 * Thresholds:
 * - 20 views  → low
 * - 50 views  → medium
 * - 100 views → high
 */
export function detectContactScraping(
  _userId: string,
  viewCount: number,
): ScrapingDetection {
  if (viewCount >= 100) {
    return { suspicious: true, severity: 'high' };
  }
  if (viewCount >= 50) {
    return { suspicious: true, severity: 'medium' };
  }
  if (viewCount >= 20) {
    return { suspicious: true, severity: 'low' };
  }
  return { suspicious: false, severity: 'low' };
}

// ---------------------------------------------------------------------------
// Abuse reporting
// ---------------------------------------------------------------------------

/**
 * Submit an abuse report.
 */
export async function reportAbuse(
  reporterId: string,
  reportedUserId: string,
  type: string,
  severity: string,
  description: string,
): Promise<AbuseReport> {
  const { data, error } = await supabase
    .from('abuse_reports')
    .insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      report_type: type,
      severity: severity,
      description,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as AbuseReport;
}

/**
 * Fetch abuse reports with optional filters.
 */
export async function getAbuseReports(
  filters?: AbuseReportFilters,
): Promise<AbuseReport[]> {
  let query = supabase
    .from('abuse_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.report_type) {
    query = query.eq('report_type', filters.report_type);
  }

  if (filters?.severity) {
    query = query.eq('severity', filters.severity);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as AbuseReport[]) ?? [];
}
