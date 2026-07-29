import { describe, it, expect } from 'vitest';
import {
  assessCredential,
  assessWorker,
  compareByUrgency,
  daysUntil,
  EMPLOYMENT_TYPE_LABELS,
  employmentTypeForRosterRole,
  EXPIRING_SOON_DAYS,
  expiryHint,
  latestOfType,
  requiredCredentialTypes,
  type CredentialType,
  type WorkerCredential,
} from '../lib/compliance';

// Fixed clock so "expiring soon" boundaries are deterministic.
const TODAY = new Date(2026, 6, 29); // 2026-07-29, local midnight

const iso = (offsetDays: number): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const type = (over: Partial<CredentialType> = {}): CredentialType => ({
  id: 'type-1',
  code: 'white_card',
  label: 'White Card',
  category: 'safety',
  applies_to_trades: null,
  state: null,
  requires_expiry: true,
  requires_document: true,
  ...over,
});

const cred = (over: Partial<WorkerCredential> = {}): WorkerCredential => ({
  id: 'cred-1',
  credential_type_id: 'type-1',
  reference_number: null,
  issued_at: null,
  expires_at: iso(365),
  document_path: null,
  verification_status: 'verified',
  verified_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('daysUntil', () => {
  it('anchors to midnight so a same-day expiry is 0, not a fraction', () => {
    expect(daysUntil(iso(0), TODAY)).toBe(0);
    expect(daysUntil(iso(1), TODAY)).toBe(1);
    expect(daysUntil(iso(-1), TODAY)).toBe(-1);
  });

  it('returns null for missing or unparseable dates', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('not-a-date', TODAY)).toBeNull();
  });
});

describe('assessCredential', () => {
  it('flags a missing credential as expired_or_missing', () => {
    expect(assessCredential(type(), null, TODAY).state).toBe('expired_or_missing');
  });

  it('treats a verified, far-future credential as compliant', () => {
    expect(assessCredential(type(), cred(), TODAY).state).toBe('compliant');
  });

  it('treats a past expiry as expired_or_missing even when still marked verified', () => {
    const a = assessCredential(type(), cred({ expires_at: iso(-1) }), TODAY);
    expect(a.state).toBe('expired_or_missing');
  });

  it('uses an inclusive boundary at EXPIRING_SOON_DAYS', () => {
    expect(assessCredential(type(), cred({ expires_at: iso(EXPIRING_SOON_DAYS) }), TODAY).state)
      .toBe('expiring_soon');
    expect(assessCredential(type(), cred({ expires_at: iso(EXPIRING_SOON_DAYS + 1) }), TODAY).state)
      .toBe('compliant');
  });

  it('does not let an unverified credential read as compliant', () => {
    expect(assessCredential(type(), cred({ verification_status: 'unverified' }), TODAY).state)
      .toBe('expiring_soon');
    expect(assessCredential(type(), cred({ verification_status: 'pending' }), TODAY).state)
      .toBe('expiring_soon');
  });

  it('treats rejected and expired statuses as expired_or_missing regardless of date', () => {
    expect(assessCredential(type(), cred({ verification_status: 'rejected' }), TODAY).state)
      .toBe('expired_or_missing');
    expect(assessCredential(type(), cred({ verification_status: 'expired' }), TODAY).state)
      .toBe('expired_or_missing');
  });

  it('requires an expiry when the type demands one', () => {
    expect(assessCredential(type({ requires_expiry: true }), cred({ expires_at: null }), TODAY).state)
      .toBe('expired_or_missing');
  });

  it('ignores a null expiry when the type does not require one (White Card never expires)', () => {
    expect(assessCredential(type({ requires_expiry: false }), cred({ expires_at: null }), TODAY).state)
      .toBe('compliant');
  });
});

describe('requiredCredentialTypes', () => {
  const all = [
    type({ id: 'universal', applies_to_trades: null, state: null }),
    type({ id: 'elec-nsw', applies_to_trades: ['electrician'], state: 'NSW' }),
    type({ id: 'elec-vic', applies_to_trades: ['electrician'], state: 'VIC' }),
    type({ id: 'wwcc-nsw', applies_to_trades: null, state: 'NSW' }),
  ];

  it('always includes all-trade, state-agnostic types', () => {
    expect(requiredCredentialTypes(all, null, null).map((t) => t.id)).toEqual(['universal']);
  });

  it('includes only the matching state when one is known', () => {
    const ids = requiredCredentialTypes(all, 'electrician', 'NSW').map((t) => t.id);
    expect(ids).toContain('elec-nsw');
    expect(ids).not.toContain('elec-vic');
    expect(ids).toContain('wwcc-nsw');
  });

  it('excludes other trades', () => {
    const ids = requiredCredentialTypes(all, 'plumber', 'NSW').map((t) => t.id);
    expect(ids).not.toContain('elec-nsw');
    expect(ids).toEqual(['universal', 'wwcc-nsw']);
  });

  it('matches trade slugs case-insensitively', () => {
    expect(requiredCredentialTypes(all, 'Electrician', 'NSW').map((t) => t.id)).toContain('elec-nsw');
  });

  it('excludes every state-specific type when the business state is unknown', () => {
    // Otherwise a business with no state on file would be told it needs all
    // eight jurisdictions' WWCCs.
    expect(requiredCredentialTypes(all, 'electrician', null).map((t) => t.id)).toEqual(['universal']);
  });
});

describe('latestOfType', () => {
  it('picks the renewal, not the superseded record', () => {
    const old = cred({ id: 'old', expires_at: iso(10) });
    const renewed = cred({ id: 'new', expires_at: iso(400) });
    expect(latestOfType([old, renewed], 'type-1')?.id).toBe('new');
    expect(latestOfType([renewed, old], 'type-1')?.id).toBe('new');
  });

  it('returns null when the worker holds nothing of that type', () => {
    expect(latestOfType([], 'type-1')).toBeNull();
  });
});

describe('assessWorker', () => {
  it('rolls up to the worst state across required credentials', () => {
    const t1 = type({ id: 't1' });
    const t2 = type({ id: 't2' });
    const result = assessWorker(
      [t1, t2],
      [cred({ credential_type_id: 't1' }), cred({ credential_type_id: 't2', expires_at: iso(-5) })],
      TODAY,
    );
    expect(result.state).toBe('expired_or_missing');
    expect(result.expiredCount).toBe(1);
  });

  it('counts a missing credential separately from an expired one', () => {
    const t1 = type({ id: 't1' });
    const t2 = type({ id: 't2' });
    const result = assessWorker([t1, t2], [cred({ credential_type_id: 't1', expires_at: iso(-5) })], TODAY);
    expect(result.expiredCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it('reports the soonest expiry across all required credentials', () => {
    const t1 = type({ id: 't1' });
    const t2 = type({ id: 't2' });
    const result = assessWorker(
      [t1, t2],
      [
        cred({ credential_type_id: 't1', expires_at: iso(200) }),
        cred({ credential_type_id: 't2', expires_at: iso(40) }),
      ],
      TODAY,
    );
    expect(result.soonestExpiry).toBe(iso(40));
  });

  it('is compliant when nothing is required', () => {
    expect(assessWorker([], [], TODAY).state).toBe('compliant');
  });
});

describe('compareByUrgency', () => {
  it('puts expired/missing workers above merely expiring ones', () => {
    const expired = assessWorker([type({ id: 't1' })], [], TODAY);
    const expiring = assessWorker(
      [type({ id: 't1' })],
      [cred({ credential_type_id: 't1', expires_at: iso(5) })],
      TODAY,
    );
    expect(compareByUrgency(expired, expiring)).toBeLessThan(0);
  });

  it('sorts soonest expiry first within the same state', () => {
    const soon = assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1', expires_at: iso(5) })], TODAY);
    const later = assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1', expires_at: iso(20) })], TODAY);
    expect(compareByUrgency(soon, later)).toBeLessThan(0);
  });

  it('sorts a worker with no expiry-bearing credentials last, not first', () => {
    const dated = assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1', expires_at: iso(100) })], TODAY);
    const undated = assessWorker([], [], TODAY);
    expect(compareByUrgency(dated, undated)).toBeLessThan(0);
  });
});

describe('employmentTypeForRosterRole', () => {
  // The DB CHECK constraint is the real contract; TypeScript cannot see it,
  // because postgrest binds insert payloads to a naked generic. A typo here
  // would only surface as a runtime constraint violation.
  const ALLOWED = ['employee_full_time', 'employee_part_time', 'employee_casual', 'subcontractor'];

  it('never recharacterises a declared subcontractor', () => {
    expect(employmentTypeForRosterRole('subcontractor')).toBe('subcontractor');
  });

  it('maps employee to full time', () => {
    expect(employmentTypeForRosterRole('employee')).toBe('employee_full_time');
  });

  it('maps apprentice to full time — apprentice is a role, not an employment basis', () => {
    expect(employmentTypeForRosterRole('apprentice')).toBe('employee_full_time');
  });

  it('is safe for null, undefined and unknown roles', () => {
    expect(employmentTypeForRosterRole(null)).toBe('employee_full_time');
    expect(employmentTypeForRosterRole(undefined)).toBe('employee_full_time');
    expect(employmentTypeForRosterRole('something-else')).toBe('employee_full_time');
  });

  it('only ever emits a value the CHECK constraint accepts', () => {
    for (const role of ['employee', 'subcontractor', 'apprentice', '', 'bogus']) {
      expect(ALLOWED).toContain(employmentTypeForRosterRole(role));
    }
    expect(ALLOWED).toContain(employmentTypeForRosterRole(null));
  });

  it('emits values the roster can label — no "unknown" cells', () => {
    for (const role of ['employee', 'subcontractor', 'apprentice', null]) {
      expect(EMPLOYMENT_TYPE_LABELS[employmentTypeForRosterRole(role)]).toBeTruthy();
    }
  });
});

describe('expiryHint', () => {
  it('reads naturally at each boundary and never implies employment status', () => {
    expect(expiryHint(null)).toBe('No expiry recorded');
    expect(expiryHint(0)).toBe('Expires today');
    expect(expiryHint(1)).toBe('Expires in 1 day');
    expect(expiryHint(9)).toBe('Expires in 9 days');
    expect(expiryHint(-1)).toBe('Expired 1 day ago');
    expect(expiryHint(-3)).toBe('Expired 3 days ago');
  });
});
