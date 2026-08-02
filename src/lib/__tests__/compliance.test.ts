// Gap coverage for src/lib/compliance.ts.
//
// src/__tests__/compliance.test.ts already covers this module thoroughly —
// daysUntil, assessCredential's full state machine, requiredCredentialTypes,
// latestOfType's happy path, the assessWorker rollup and compareByUrgency. This
// file adds ONLY the branches that file does not reach; nothing here duplicates it.

import { describe, it, expect } from 'vitest';
import {
  assessWorker,
  compareByUrgency,
  COMPLIANCE_META,
  daysUntil,
  EMPLOYMENT_TYPE_LABELS,
  employmentTypeForRosterRole,
  latestOfType,
  requiredCredentialTypes,
  ROSTER_STATUS_META,
  VERIFICATION_META,
  type CredentialType,
  type WorkerCredential,
} from '../compliance';

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

describe('daysUntil — input shapes the other suite does not reach', () => {
  it('returns null for an empty string, not 0 days', () => {
    expect(daysUntil('', TODAY)).toBeNull();
    expect(daysUntil(undefined, TODAY)).toBeNull();
  });

  // The helper appends "T00:00:00" to anchor a DATE at local midnight, so it
  // only accepts a date-only string. A full timestamp becomes unparseable and
  // silently reads as "no expiry recorded" — fine while worker_credentials
  // .expires_at is a `date` column, and a trap if that ever becomes timestamptz.
  it('returns null for a full ISO timestamp — it only accepts date-only strings', () => {
    expect(daysUntil('2026-08-01T10:00:00Z', TODAY)).toBeNull();
  });

  it('counts across a month boundary rather than resetting', () => {
    expect(daysUntil('2026-08-05', TODAY)).toBe(7);
  });

  it('measures from the given clock, not from now', () => {
    expect(daysUntil('2026-08-05', new Date(2026, 7, 4))).toBe(1);
  });
});

describe('requiredCredentialTypes — the empty trade list', () => {
  it('treats an EMPTY applies_to_trades array as "all trades", like null', () => {
    const types = [type({ id: 'universal-empty', applies_to_trades: [] })];
    expect(requiredCredentialTypes(types, 'plumber', 'NSW').map((t) => t.id)).toEqual(['universal-empty']);
    expect(requiredCredentialTypes(types, null, null).map((t) => t.id)).toEqual(['universal-empty']);
  });

  it('matches on the type side case-insensitively too', () => {
    const types = [type({ id: 'elec', applies_to_trades: ['Electrician'] })];
    expect(requiredCredentialTypes(types, 'electrician', null).map((t) => t.id)).toEqual(['elec']);
  });

  it('returns an empty list when there are no types at all', () => {
    expect(requiredCredentialTypes([], 'plumber', 'NSW')).toEqual([]);
  });
});

describe('latestOfType — the issued_at fallback', () => {
  it('falls back to the issue date when neither record carries an expiry', () => {
    const older = cred({ id: 'older', expires_at: null, issued_at: '2024-01-01' });
    const newer = cred({ id: 'newer', expires_at: null, issued_at: '2026-01-01' });
    expect(latestOfType([older, newer], 'type-1')?.id).toBe('newer');
    expect(latestOfType([newer, older], 'type-1')?.id).toBe('newer');
  });

  it('sorts a record with neither date last', () => {
    const dateless = cred({ id: 'dateless', expires_at: null, issued_at: null });
    const dated = cred({ id: 'dated', expires_at: null, issued_at: '2020-01-01' });
    expect(latestOfType([dateless, dated], 'type-1')?.id).toBe('dated');
  });

  it('ignores credentials belonging to other types', () => {
    const mine = cred({ id: 'mine', credential_type_id: 'type-1', expires_at: iso(10) });
    const theirs = cred({ id: 'theirs', credential_type_id: 'type-2', expires_at: iso(999) });
    expect(latestOfType([theirs, mine], 'type-1')?.id).toBe('mine');
    expect(latestOfType([theirs, mine], 'type-3')).toBeNull();
  });

  // Documented consequence of the `expires_at ?? issued_at` key: the comparison
  // is lexicographic across two different meanings. A record with only an issue
  // date in 2026 outranks one that genuinely expires in 2025.
  it('compares an issue date against an expiry date when only one record has an expiry', () => {
    const expiring = cred({ id: 'expiring', expires_at: '2025-03-01', issued_at: '2020-01-01' });
    const issuedOnly = cred({ id: 'issued-only', expires_at: null, issued_at: '2026-01-01' });
    expect(latestOfType([expiring, issuedOnly], 'type-1')?.id).toBe('issued-only');
  });
});

describe('assessWorker — the amber rollup', () => {
  it('rolls up to expiring_soon when the worst credential is merely near expiry', () => {
    const result = assessWorker(
      [type({ id: 't1' }), type({ id: 't2' })],
      [
        cred({ credential_type_id: 't1', expires_at: iso(400) }),
        cred({ credential_type_id: 't2', expires_at: iso(5) }),
      ],
      TODAY,
    );
    expect(result.state).toBe('expiring_soon');
    expect(result.expiringCount).toBe(1);
    expect(result.expiredCount).toBe(0);
  });

  it('counts expiring and expired separately while reporting the worse state', () => {
    const result = assessWorker(
      [type({ id: 't1' }), type({ id: 't2' }), type({ id: 't3' })],
      [
        cred({ credential_type_id: 't1', expires_at: iso(5) }),
        cred({ credential_type_id: 't2', expires_at: iso(10) }),
        cred({ credential_type_id: 't3', expires_at: iso(-2) }),
      ],
      TODAY,
    );
    expect(result.state).toBe('expired');
    expect(result.expiringCount).toBe(2);
    expect(result.expiredCount).toBe(1);
  });

  it('returns one assessment per required type, including waived and unrecorded ones', () => {
    const result = assessWorker(
      [type({ id: 't1' }), type({ id: 't2' }), type({ id: 't3' })],
      [cred({ credential_type_id: 't1' })],
      TODAY,
      new Set(['t3']),
    );
    expect(result.assessments).toHaveLength(3);
    expect(result.assessments.map((a) => a.state)).toEqual(['compliant', 'not_recorded', 'not_required']);
    expect(result.notRecordedCount + result.notRequiredCount).toBe(2);
  });

  it('leaves soonestExpiry null when the only recorded credential has no expiry', () => {
    const result = assessWorker(
      [type({ id: 't1', requires_expiry: false })],
      [cred({ credential_type_id: 't1', expires_at: null })],
      TODAY,
    );
    expect(result.state).toBe('compliant');
    expect(result.soonestExpiry).toBeNull();
  });

  it('reports an expired credential\'s own date as the soonest expiry', () => {
    const result = assessWorker(
      [type({ id: 't1' }), type({ id: 't2' })],
      [
        cred({ credential_type_id: 't1', expires_at: iso(-30) }),
        cred({ credential_type_id: 't2', expires_at: iso(10) }),
      ],
      TODAY,
    );
    expect(result.soonestExpiry).toBe(iso(-30));
  });
});

describe('compareByUrgency — ties', () => {
  it('returns 0 for two workers in the same state with no expiry between them', () => {
    const a = assessWorker([], [], TODAY);
    const b = assessWorker([], [], TODAY);
    expect(compareByUrgency(a, b)).toBe(0);
  });

  it('returns 0 for two workers sharing the same soonest expiry', () => {
    const make = () =>
      assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1', expires_at: iso(12) })], TODAY);
    expect(compareByUrgency(make(), make())).toBe(0);
  });

  it('is antisymmetric, so the sort order does not depend on input order', () => {
    const expired = assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1', expires_at: iso(-1) })], TODAY);
    const compliant = assessWorker([type({ id: 't1' })], [cred({ credential_type_id: 't1' })], TODAY);
    expect(Math.sign(compareByUrgency(expired, compliant))).toBe(-Math.sign(compareByUrgency(compliant, expired)));
  });

  it('sorts a mixed roster most-urgent-first with untracked last', () => {
    const w = (over: Partial<WorkerCredential> | null) =>
      assessWorker([type({ id: 't1' })], over ? [cred({ credential_type_id: 't1', ...over })] : [], TODAY);
    const untracked = w(null);
    const compliant = w({ expires_at: iso(300) });
    const expiring = w({ expires_at: iso(10) });
    const expired = w({ expires_at: iso(-10) });

    const sorted = [untracked, compliant, expired, expiring].sort(compareByUrgency);
    expect(sorted.map((s) => s.state)).toEqual(['expired', 'expiring_soon', 'compliant', 'not_tracked']);
  });
});

describe('presentation maps', () => {
  it('has a label for every compliance state, so no badge can render blank', () => {
    for (const state of ['compliant', 'expiring_soon', 'expired', 'not_recorded', 'not_required', 'not_tracked'] as const) {
      expect(COMPLIANCE_META[state].label).toBeTruthy();
      expect(COMPLIANCE_META[state].badgeClass).toContain('bg-ct-');
    }
  });

  it('has a label for every verification status', () => {
    for (const status of ['unverified', 'pending', 'verified', 'rejected', 'expired'] as const) {
      expect(VERIFICATION_META[status].label).toBeTruthy();
    }
  });

  it('has a label for every roster status the DB allows', () => {
    for (const status of ['invited', 'active', 'inactive', 'archived']) {
      expect(ROSTER_STATUS_META[status]?.label).toBeTruthy();
    }
  });

  it('every employment type the mapper can emit has a label', () => {
    for (const role of ['employee', 'subcontractor', 'apprentice', null]) {
      expect(EMPLOYMENT_TYPE_LABELS[employmentTypeForRosterRole(role)]).toBeTruthy();
    }
  });

  // Regression: these two dots shipped colourless. A trailing "0" left by the
  // v2 token find-and-replace ("bg-ct-amber/[0.13]0") made Tailwind emit no
  // rule at all, on precisely the two states meant to draw the eye. Every dot
  // is now a clean solid token, like `compliant` always was.
  it('renders every status dot as a solid semantic token', () => {
    expect(COMPLIANCE_META.compliant.dotClass).toBe('bg-ct-teal');
    expect(COMPLIANCE_META.expiring_soon.dotClass).toBe('bg-ct-amber');
    expect(COMPLIANCE_META.expired.dotClass).toBe('bg-ct-rose');
    for (const meta of Object.values(COMPLIANCE_META)) {
      expect(meta.dotClass).not.toMatch(/\]\d/);
    }
  });
});
