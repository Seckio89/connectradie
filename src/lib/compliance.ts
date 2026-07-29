// ─────────────────────────────────────────────────────────────────────────────
// Workforce compliance logic — the single place that decides whether a worker
// reads as compliant, expiring soon, or expired/missing.
//
// The roster's compliance column is the whole product, so this must be the only
// implementation. Both the roster and the worker detail page read it, and the
// invite flow reuses requiredCredentialTypes() to pre-fill what a role needs.
//
// PRIVACY: nothing here touches identity data. A credential is an outcome plus an
// expiry — see the worker_credentials migration.
// ─────────────────────────────────────────────────────────────────────────────

/** A credential inside this window counts as "expiring soon" rather than compliant. */
export const EXPIRING_SOON_DAYS = 30;

export type ComplianceState = 'compliant' | 'expiring_soon' | 'expired_or_missing';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired';

export interface CredentialType {
  id: string;
  code: string;
  label: string;
  category: string;
  applies_to_trades: string[] | null;
  state: string | null;
  requires_expiry: boolean;
  requires_document: boolean;
}

export interface WorkerCredential {
  id: string;
  credential_type_id: string;
  reference_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  document_path: string | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
}

/** Per-required-credential outcome, used to build the worker-level rollup. */
export interface CredentialAssessment {
  type: CredentialType;
  credential: WorkerCredential | null;
  state: ComplianceState;
  daysUntilExpiry: number | null;
}

export interface WorkerCompliance {
  state: ComplianceState;
  /** Soonest expiry across required credentials. Drives the roster's default sort. */
  soonestExpiry: string | null;
  missingCount: number;
  expiringCount: number;
  expiredCount: number;
  assessments: CredentialAssessment[];
}

/** Ordering used to roll individual credentials up to a worst-case worker state. */
const SEVERITY: Record<ComplianceState, number> = {
  compliant: 0,
  expiring_soon: 1,
  expired_or_missing: 2,
};

export const COMPLIANCE_META: Record<
  ComplianceState,
  { label: string; badgeClass: string; dotClass: string }
> = {
  compliant: {
    label: 'Compliant',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  expiring_soon: {
    label: 'Expiring soon',
    badgeClass: 'bg-amber-100 text-amber-700',
    dotClass: 'bg-amber-500',
  },
  expired_or_missing: {
    label: 'Expired or missing',
    badgeClass: 'bg-red-100 text-red-700',
    dotClass: 'bg-red-500',
  },
};

export const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; badgeClass: string }
> = {
  unverified: { label: 'Not verified', badgeClass: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Awaiting review', badgeClass: 'bg-secondary-100 text-secondary-700' },
  verified: { label: 'Verified', badgeClass: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', badgeClass: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', badgeClass: 'bg-red-100 text-red-700' },
};

/** Midnight-anchored day difference, so a date-only expiry never drifts by hours. */
export function daysUntil(dateStr: string | null | undefined, today = new Date()): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - anchor.getTime()) / 86_400_000);
}

/**
 * Which credentials a worker at this business is expected to hold.
 *
 * A type applies when its trade list is NULL (all trades) or contains the
 * business's trade. State-specific types (WWCC, trade licences) are only required
 * when we actually know the business's state — otherwise we would demand all eight
 * jurisdictions. A business can always add any credential manually.
 */
export function requiredCredentialTypes(
  types: CredentialType[],
  trade: string | null | undefined,
  state: string | null | undefined,
): CredentialType[] {
  const tradeSlug = (trade ?? '').toLowerCase();
  return types.filter((t) => {
    const tradeMatches = t.applies_to_trades === null || t.applies_to_trades.length === 0
      ? true
      : !!tradeSlug && t.applies_to_trades.some((s) => s.toLowerCase() === tradeSlug);
    if (!tradeMatches) return false;
    if (t.state === null) return true;
    return !!state && t.state === state;
  });
}

/** Most recently issued credential of a given type — renewals supersede, not replace. */
export function latestOfType(
  credentials: WorkerCredential[],
  typeId: string,
): WorkerCredential | null {
  const matches = credentials.filter((c) => c.credential_type_id === typeId);
  if (matches.length === 0) return null;
  return matches.reduce((best, c) => {
    // Prefer the later expiry; fall back to the later issue date.
    const key = (x: WorkerCredential) => x.expires_at ?? x.issued_at ?? '';
    return key(c) > key(best) ? c : best;
  });
}

/**
 * State of one credential against its type.
 *
 * Amber covers two situations that both mean "someone must act soon": the expiry
 * is close, or the credential exists but nobody has verified it yet.
 */
export function assessCredential(
  type: CredentialType,
  credential: WorkerCredential | null,
  today = new Date(),
): CredentialAssessment {
  if (!credential) {
    return { type, credential: null, state: 'expired_or_missing', daysUntilExpiry: null };
  }

  const days = daysUntil(credential.expires_at, today);

  if (credential.verification_status === 'rejected' || credential.verification_status === 'expired') {
    return { type, credential, state: 'expired_or_missing', daysUntilExpiry: days };
  }
  if (type.requires_expiry) {
    if (days === null) {
      // An expiry is required but none was recorded — treat as incomplete, not compliant.
      return { type, credential, state: 'expired_or_missing', daysUntilExpiry: null };
    }
    if (days < 0) return { type, credential, state: 'expired_or_missing', daysUntilExpiry: days };
    if (days <= EXPIRING_SOON_DAYS) return { type, credential, state: 'expiring_soon', daysUntilExpiry: days };
  }
  if (credential.verification_status !== 'verified') {
    return { type, credential, state: 'expiring_soon', daysUntilExpiry: days };
  }
  return { type, credential, state: 'compliant', daysUntilExpiry: days };
}

/** Roll a worker's required credentials up to one worst-case state. */
export function assessWorker(
  requiredTypes: CredentialType[],
  credentials: WorkerCredential[],
  today = new Date(),
): WorkerCompliance {
  const assessments = requiredTypes.map((type) =>
    assessCredential(type, latestOfType(credentials, type.id), today),
  );

  let worst: ComplianceState = 'compliant';
  let missingCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let soonestExpiry: string | null = null;

  for (const a of assessments) {
    if (SEVERITY[a.state] > SEVERITY[worst]) worst = a.state;
    if (a.state === 'expired_or_missing') {
      if (a.credential) expiredCount++;
      else missingCount++;
    } else if (a.state === 'expiring_soon') {
      expiringCount++;
    }
    const exp = a.credential?.expires_at ?? null;
    if (exp && (soonestExpiry === null || exp < soonestExpiry)) soonestExpiry = exp;
  }

  return { state: worst, soonestExpiry, missingCount, expiringCount, expiredCount, assessments };
}

/**
 * Roster sort: soonest expiry first, because that is the column that costs money.
 * Workers with something already expired or missing outrank any future date, and
 * a worker with no expiry-bearing credentials sorts last rather than first.
 */
export function compareByUrgency(a: WorkerCompliance, b: WorkerCompliance): number {
  if (SEVERITY[a.state] !== SEVERITY[b.state]) return SEVERITY[b.state] - SEVERITY[a.state];
  if (a.soonestExpiry && b.soonestExpiry) return a.soonestExpiry.localeCompare(b.soonestExpiry);
  if (a.soonestExpiry) return -1;
  if (b.soonestExpiry) return 1;
  return 0;
}

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  employee_full_time: 'Employee — full time',
  employee_part_time: 'Employee — part time',
  employee_casual: 'Employee — casual',
  subcontractor: 'Subcontractor',
};

export const ROSTER_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  invited: { label: 'Invited', badgeClass: 'bg-secondary-100 text-secondary-700' },
  active: { label: 'Active', badgeClass: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: 'Inactive', badgeClass: 'bg-gray-100 text-gray-600' },
  archived: { label: 'Archived', badgeClass: 'bg-gray-100 text-gray-600' },
};

/** Human-readable expiry hint. Never characterises employment status. */
export function expiryHint(days: number | null): string {
  if (days === null) return 'No expiry recorded';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}
