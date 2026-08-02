// ─────────────────────────────────────────────────────────────────────────────
// Workforce compliance logic — the single place that decides how a worker reads.
//
// The roster's compliance column is the whole product, so this must be the only
// implementation. Both the roster and the worker detail page read it, and the
// invite flow reuses requiredCredentialTypes() to pre-fill what a role needs.
//
// TWO RULES EARNED THE HARD WAY:
//
//   1. RED MEANS LAPSED, NOT UNSTARTED. A credential nobody has entered yet has
//      not expired — there is simply nothing there. The first version collapsed
//      both into "Expired or missing", so a worker invited two minutes ago showed
//      five red badges. An indicator that cries wolf gets ignored, and then it is
//      worth nothing on the day something genuinely does expire.
//
//   2. THE SEEDED SET IS A DEFAULT, NOT A DETERMINATION. We cannot know whether a
//      given cleaner works on construction sites (White Card) or around children
//      (WWCC). Businesses waive what does not apply via worker_credential_exemptions,
//      and an exemption drops the credential out of the rollup entirely.
//
// PRIVACY: nothing here touches identity data. A credential is an outcome plus an
// expiry — see the worker_credentials migration.
// ─────────────────────────────────────────────────────────────────────────────

/** A credential inside this window counts as "expiring soon" rather than compliant. */
export const EXPIRING_SOON_DAYS = 30;

/**
 * State of ONE credential.
 *
 * `not_recorded` and `not_required` are both neutral: nothing is wrong, there is
 * just nothing to report. Only `expired` is red.
 */
export type ComplianceState =
  | 'compliant'
  | 'expiring_soon'
  | 'expired'
  | 'not_recorded'
  | 'not_required';

/**
 * Rolled-up state of a WORKER.
 *
 * `not_tracked` means nothing has been recorded at all — a new worker, not a
 * problem. It is deliberately not a member of the red/amber scale.
 */
export type WorkerComplianceState =
  | 'compliant'
  | 'expiring_soon'
  | 'expired'
  | 'not_tracked';

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

/** Per-credential outcome, used to build the worker-level rollup. */
export interface CredentialAssessment {
  type: CredentialType;
  credential: WorkerCredential | null;
  state: ComplianceState;
  daysUntilExpiry: number | null;
}

export interface WorkerCompliance {
  state: WorkerComplianceState;
  /** Soonest expiry across tracked credentials. Drives the roster's default sort. */
  soonestExpiry: string | null;
  /** Applicable but never entered. Prompts, but does not alarm. */
  notRecordedCount: number;
  expiringCount: number;
  expiredCount: number;
  /** Waived by the business — shown muted, excluded from every other count. */
  notRequiredCount: number;
  assessments: CredentialAssessment[];
}

/**
 * Rollup ordering. Only the three ACTIONABLE states appear here — `not_recorded`
 * and `not_required` never escalate a worker's badge, which is the whole point.
 */
const SEVERITY: Record<'compliant' | 'expiring_soon' | 'expired', number> = {
  compliant: 0,
  expiring_soon: 1,
  expired: 2,
};

export const COMPLIANCE_META: Record<
  ComplianceState | 'not_tracked',
  { label: string; badgeClass: string; dotClass: string }
> = {
  compliant: {
    label: 'Compliant',
    badgeClass: 'bg-ct-teal/[0.14] text-ct-teal',
    dotClass: 'bg-ct-teal',
  },
  expiring_soon: {
    label: 'Expiring soon',
    badgeClass: 'bg-ct-amber/[0.13] text-ct-amber',
    dotClass: 'bg-ct-amber',
  },
  expired: {
    label: 'Expired',
    badgeClass: 'bg-ct-rose/[0.13] text-ct-rose',
    dotClass: 'bg-ct-rose',
  },
  not_recorded: {
    label: 'Not recorded',
    badgeClass: 'bg-ct-surface-2 text-ct-mute-2',
    dotClass: 'bg-ct-surface-2',
  },
  not_required: {
    label: 'Not required',
    badgeClass: 'bg-ct-surface-2 text-ct-mute',
    dotClass: 'bg-ct-line',
  },
  not_tracked: {
    label: 'Not tracked',
    badgeClass: 'bg-ct-surface-2 text-ct-mute-2',
    dotClass: 'bg-ct-surface-2',
  },
};

export const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; badgeClass: string }
> = {
  unverified: { label: 'Not verified', badgeClass: 'bg-ct-surface-2 text-ct-mute-2' },
  pending: { label: 'Awaiting review', badgeClass: 'bg-ct-surface-2 text-ct-mute-2' },
  verified: { label: 'Verified', badgeClass: 'bg-ct-teal/[0.14] text-ct-teal' },
  rejected: { label: 'Rejected', badgeClass: 'bg-ct-rose/[0.13] text-ct-rose' },
  expired: { label: 'Expired', badgeClass: 'bg-ct-rose/[0.13] text-ct-rose' },
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
 * `not_recorded` is NOT `expired`. Nothing has lapsed — there is simply nothing
 * there yet. Collapsing the two is what made a brand-new worker show a wall of
 * red, and it is the reason this distinction exists at all.
 *
 * Amber covers the two situations that mean "someone must act soon": the expiry
 * is close, or the credential exists but nobody has verified it yet.
 */
export function assessCredential(
  type: CredentialType,
  credential: WorkerCredential | null,
  today = new Date(),
  exempt = false,
): CredentialAssessment {
  // The business has said this does not apply. Nothing else matters.
  if (exempt) {
    return { type, credential, state: 'not_required', daysUntilExpiry: null };
  }
  if (!credential) {
    return { type, credential: null, state: 'not_recorded', daysUntilExpiry: null };
  }

  const days = daysUntil(credential.expires_at, today);

  if (credential.verification_status === 'rejected' || credential.verification_status === 'expired') {
    return { type, credential, state: 'expired', daysUntilExpiry: days };
  }
  if (type.requires_expiry) {
    if (days === null) {
      // The record exists but is incomplete — an expiry was required and left
      // blank. Amber, not red: nothing has lapsed, it just needs finishing.
      return { type, credential, state: 'expiring_soon', daysUntilExpiry: null };
    }
    if (days < 0) return { type, credential, state: 'expired', daysUntilExpiry: days };
    if (days <= EXPIRING_SOON_DAYS) return { type, credential, state: 'expiring_soon', daysUntilExpiry: days };
  }
  if (credential.verification_status !== 'verified') {
    return { type, credential, state: 'expiring_soon', daysUntilExpiry: days };
  }
  return { type, credential, state: 'compliant', daysUntilExpiry: days };
}

/**
 * Roll a worker's credentials up to one state.
 *
 * Only credentials that were actually RECORDED can move the badge. A worker with
 * nothing on file reads `not_tracked` — neutral, because a new worker is not a
 * compliance failure. Waived credentials are excluded entirely.
 */
export function assessWorker(
  requiredTypes: CredentialType[],
  credentials: WorkerCredential[],
  today = new Date(),
  exemptTypeIds: ReadonlySet<string> = new Set(),
): WorkerCompliance {
  const assessments = requiredTypes.map((type) =>
    assessCredential(type, latestOfType(credentials, type.id), today, exemptTypeIds.has(type.id)),
  );

  let worst: 'compliant' | 'expiring_soon' | 'expired' | null = null;
  let notRecordedCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let notRequiredCount = 0;
  let soonestExpiry: string | null = null;

  for (const a of assessments) {
    switch (a.state) {
      case 'not_required':
        notRequiredCount++;
        continue; // never counted, never escalates, no expiry contribution
      case 'not_recorded':
        notRecordedCount++;
        continue; // prompts on the detail page, but does not colour the worker
      case 'expired':
        expiredCount++;
        break;
      case 'expiring_soon':
        expiringCount++;
        break;
    }

    if (worst === null || SEVERITY[a.state] > SEVERITY[worst]) worst = a.state;

    const exp = a.credential?.expires_at ?? null;
    if (exp && (soonestExpiry === null || exp < soonestExpiry)) soonestExpiry = exp;
  }

  return {
    state: worst ?? 'not_tracked',
    soonestExpiry,
    notRecordedCount,
    expiringCount,
    expiredCount,
    notRequiredCount,
    assessments,
  };
}

/** Rollup severity including the neutral bucket, for sorting only. */
const WORKER_SEVERITY: Record<WorkerComplianceState, number> = {
  not_tracked: -1, // sorts last: nothing to act on
  compliant: 0,
  expiring_soon: 1,
  expired: 2,
};

/**
 * Roster sort: most urgent first, then soonest expiry — that is the column that
 * costs money. Untracked workers sort last rather than first, so the top of the
 * list is always the things that actually need doing.
 */
export function compareByUrgency(a: WorkerCompliance, b: WorkerCompliance): number {
  if (WORKER_SEVERITY[a.state] !== WORKER_SEVERITY[b.state]) {
    return WORKER_SEVERITY[b.state] - WORKER_SEVERITY[a.state];
  }
  if (a.soonestExpiry && b.soonestExpiry) return a.soonestExpiry.localeCompare(b.soonestExpiry);
  if (a.soonestExpiry) return -1;
  if (b.soonestExpiry) return 1;
  return 0;
}

/**
 * Derive `employment_type` from the roster `role` when a caller only collects
 * the latter.
 *
 * The two columns are deliberately independent — `role` is the long-standing
 * employee/subcontractor/apprentice vocabulary that ~20 call sites and
 * get_service_worker_details depend on, while `employment_type` is the finer
 * basis the workforce module displays. But a write that sets only `role` takes
 * the `employee_full_time` DEFAULT, which would render someone the business
 * declared a Subcontractor as "Employee — full time". The platform must never
 * recharacterise a worker's employment basis, so any path that captures role
 * must derive this alongside it.
 *
 * Mapping matches the backfill in 20260728205103 exactly. 'apprentice' is a role,
 * not an employment basis, so it falls to full-time; the business can refine it
 * to part-time or casual on the worker's detail page.
 */
export function employmentTypeForRosterRole(role: string | null | undefined): string {
  return role === 'subcontractor' ? 'subcontractor' : 'employee_full_time';
}

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  employee_full_time: 'Employee — full time',
  employee_part_time: 'Employee — part time',
  employee_casual: 'Employee — casual',
  subcontractor: 'Subcontractor',
};

export const ROSTER_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  invited: { label: 'Invited', badgeClass: 'bg-ct-surface-2 text-ct-mute-2' },
  active: { label: 'Active', badgeClass: 'bg-ct-teal/[0.14] text-ct-teal' },
  inactive: { label: 'Inactive', badgeClass: 'bg-ct-surface-2 text-ct-mute-2' },
  archived: { label: 'Archived', badgeClass: 'bg-ct-surface-2 text-ct-mute-2' },
};

/** Human-readable expiry hint. Never characterises employment status. */
export function expiryHint(days: number | null): string {
  if (days === null) return 'No expiry recorded';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}
