// Vitest coverage for the verification logic the browser runs: ABN checksum and
// name matching (live validation in the onboarding field), per-state licence
// parsers, pre-checks and register URL substitution (admin review card).
//
// The implementations live in supabase/functions/_shared and are re-exported by
// src/lib/verification.ts, so these tests exercise the SAME code the edge
// functions run.

import { describe, it, expect } from 'vitest';
import {
  normaliseAbn,
  isValidAbnChecksum,
  formatAbn,
  businessNameMatches,
  classifyAbnResult,
  parseAuDate,
  parseLicenceText,
  runPrechecks,
  buildRegisterUrl,
  templateHasDeepLink,
  formatExpiryMonth,
} from '../verification';

describe('ABN checksum', () => {
  it('accepts a valid ABN', () => {
    expect(isValidAbnChecksum('51824753556')).toBe(true);
  });
  it('rejects an invalid ABN', () => {
    expect(isValidAbnChecksum('51824753557')).toBe(false);
    expect(isValidAbnChecksum('00000000000')).toBe(false);
  });
  it('validates a formatted ABN once normalised', () => {
    expect(isValidAbnChecksum('51 824 753 556')).toBe(false);
    expect(isValidAbnChecksum(normaliseAbn('51 824 753 556'))).toBe(true);
    expect(formatAbn('51824753556')).toBe('51 824 753 556');
  });
});

describe('business name matcher', () => {
  it('matches exactly, ignoring case and punctuation', () => {
    expect(businessNameMatches("Smith's Plumbing", ['SMITHS PLUMBING'])).toBe(true);
  });
  it('treats Pty Ltd variants as the same name', () => {
    expect(businessNameMatches('Smith Plumbing Pty Ltd', ['Smith Plumbing Pty. Ltd.'])).toBe(true);
    expect(businessNameMatches('Smith Plumbing P/L', ['Smith Plumbing'])).toBe(true);
    expect(businessNameMatches('Smith Plumbing', ['SMITH PLUMBING PTY LIMITED'])).toBe(true);
  });
  it('does not match a different business', () => {
    expect(businessNameMatches('Jones Electrical', ['Smith Plumbing', 'SMITH, JOHN'])).toBe(false);
  });
  it('classifies verified / review / failed', () => {
    expect(classifyAbnResult('Active', true)).toBe('verified');
    expect(classifyAbnResult('Active', false)).toBe('review');
    expect(classifyAbnResult('Cancelled', true)).toBe('failed');
  });
});

describe('licence parsers', () => {
  const NSW = 'NSW Fair Trading\nLicence No: 123456C\nName: JOHN SMITH\nCategories: Plumber, Drainer\nExpires: 14/03/2027';
  const QLD = 'QBCC\nLicence No. 1234567\nLicensee: SMITH, JOHN\nLicence Class: Plumbing and Drainage\nRenewal Due: 30 Jun 2027';

  it('parses an NSW card', () => {
    const p = parseLicenceText('NSW', NSW);
    expect(p).toMatchObject({
      parser: 'NSW',
      licence_number: '123456C',
      licence_holder_name: 'John Smith',
      licence_class: 'Plumber, Drainer',
      expiry_date: '2027-03-14',
    });
  });
  it('parses a QLD card', () => {
    const p = parseLicenceText('QLD', QLD);
    expect(p).toMatchObject({ parser: 'QLD', licence_number: '1234567', expiry_date: '2027-06-30' });
  });
  it('falls back to the generic parser for other states and never throws on junk', () => {
    expect(parseLicenceText('WA', '').fields_found_ratio).toBe(0);
    expect(parseLicenceText('TAS', 'Expiry: 01/01/2030').expiry_date).toBe('2030-01-01');
    expect(parseLicenceText('SA', QLD).parser).toBe('generic');
  });
  it('parses the date formats cards use', () => {
    expect(parseAuDate('31 Dec 2027')).toBe('2027-12-31');
    expect(parseAuDate('31/12/27')).toBe('2027-12-31');
    expect(parseAuDate('nonsense')).toBeNull();
  });
});

describe('pre-checks', () => {
  it('passes a current, matching licence', () => {
    expect(runPrechecks({
      expiry_date: '2027-03-14',
      licence_holder_name: 'SMITH JOHN',
      candidate_names: ['John Smith'],
      licence_class: 'Plumber, Drainer',
      trade_category: 'plumber',
      today: '2026-09-04',
    })).toEqual({ precheck_expiry_ok: true, precheck_name_match: true, precheck_class_match: true });
  });
  it('fails an expired licence and a class for the wrong trade', () => {
    expect(runPrechecks({
      expiry_date: '2020-01-01',
      licence_holder_name: 'John Smith',
      candidate_names: ['John Smith'],
      licence_class: 'Electrician',
      trade_category: 'plumber',
      today: '2026-09-04',
    })).toEqual({ precheck_expiry_ok: false, precheck_name_match: true, precheck_class_match: false });
  });
  it('leaves unknowns as null rather than false', () => {
    expect(runPrechecks({
      expiry_date: null,
      licence_holder_name: null,
      candidate_names: [],
      licence_class: null,
      trade_category: 'plumber',
    })).toEqual({ precheck_expiry_ok: null, precheck_name_match: null, precheck_class_match: null });
  });
});

describe('register URL template', () => {
  it('substitutes and encodes the licence number', () => {
    expect(buildRegisterUrl('https://reg.example/?n={{licence_number}}', '12 34C')).toBe('https://reg.example/?n=12%2034C');
    expect(templateHasDeepLink('https://reg.example/?n={{licence_number}}')).toBe(true);
  });
  it('returns a landing page unchanged', () => {
    expect(buildRegisterUrl('https://reg.example/search', '1234C')).toBe('https://reg.example/search');
    expect(templateHasDeepLink('https://reg.example/search')).toBe(false);
  });
});

describe('formatExpiryMonth', () => {
  it('renders month + year only, never a day', () => {
    expect(formatExpiryMonth('2027-12')).toBe('Dec 2027');
    expect(formatExpiryMonth(null)).toBeNull();
    expect(formatExpiryMonth('bad')).toBeNull();
  });
});
