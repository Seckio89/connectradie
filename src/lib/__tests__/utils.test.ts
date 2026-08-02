// src/lib/utils.ts — date formatting, profile completion, and friendlyError,
// the error-message mapper every user-facing toast goes through.
//
// Date strings are written WITHOUT a trailing Z on purpose. `new Date('2026-07-29')`
// is parsed as UTC midnight and then read back with local getters, so on any
// machine behind UTC the day silently shifts. The date-only form is exactly what
// these helpers receive in production, but pinning the timezone in a test would
// hide that, so the tests below use the local-time form and the UTC-shift risk is
// exercised explicitly in its own case.

import { describe, it, expect } from 'vitest';
import {
  calculateProfileCompletion,
  checkLicenseExpired,
  formatDate,
  formatDateTime,
  formatTime,
  friendlyError,
  getProfileCompletionTasks,
} from '../utils';

describe('formatDate', () => {
  it('renders Australian day/month/year order', () => {
    expect(formatDate('2026-07-29T00:00:00')).toBe('29/07/2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(formatDate('2026-01-05T00:00:00')).toBe('05/01/2026');
  });

  it('does not roll over at the end of the month', () => {
    expect(formatDate('2026-02-28T23:59:00')).toBe('28/02/2026');
  });

  it('handles a leap day', () => {
    expect(formatDate('2024-02-29T12:00:00')).toBe('29/02/2024');
  });

  // BUG: an unparseable date produces the literal string "NaN/NaN/NaN" rather
  // than an empty string or a dash, and that goes straight onto the screen.
  // Asserting current behaviour — not fixing it here.
  it('BUG: emits NaN/NaN/NaN for an unparseable date instead of degrading', () => {
    expect(formatDate('not-a-date')).toBe('NaN/NaN/NaN');
    expect(formatDate('')).toBe('NaN/NaN/NaN');
  });
});

describe('formatTime', () => {
  it('renders hour and minute only, no seconds', () => {
    const out = formatTime('2026-07-29T14:05:09');
    expect(out).toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(out).not.toMatch(/:\d{2}:\d{2}/);
    expect(out).toContain('05');
  });

  it('distinguishes morning from afternoon', () => {
    expect(formatTime('2026-07-29T09:30:00')).not.toBe(formatTime('2026-07-29T21:30:00'));
  });
});

describe('formatDateTime', () => {
  it('is the date, a single space, then the time', () => {
    const out = formatDateTime('2026-07-29T14:05:00');
    expect(out.startsWith('29/07/2026 ')).toBe(true);
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4} \S/);
    expect(out.endsWith(formatTime('2026-07-29T14:05:00'))).toBe(true);
  });
});

describe('calculateProfileCompletion', () => {
  const full = {
    email: 'a@b.com',
    full_name: 'Tess Magson',
    phone: '0400 000 000',
    address: '1 Test St',
    postcode: '2000',
  };

  it('returns 0 for a null profile rather than throwing', () => {
    expect(calculateProfileCompletion(null)).toBe(0);
  });

  it('returns 0 when nothing is filled in', () => {
    expect(calculateProfileCompletion({})).toBe(0);
  });

  it('returns 100 when all five fields are present', () => {
    expect(calculateProfileCompletion(full)).toBe(100);
  });

  it('counts each field as 20%', () => {
    expect(calculateProfileCompletion({ email: 'a@b.com' })).toBe(20);
    expect(calculateProfileCompletion({ email: 'a@b.com', phone: '0400' })).toBe(40);
    expect(calculateProfileCompletion({ ...full, postcode: undefined })).toBe(80);
  });

  it('treats an empty string as not filled in', () => {
    expect(calculateProfileCompletion({ ...full, phone: '' })).toBe(80);
  });

  it('never exceeds 100 or drops below 0', () => {
    const pct = calculateProfileCompletion(full);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('getProfileCompletionTasks', () => {
  it('lists every task for a null profile', () => {
    expect(getProfileCompletionTasks(null)).toHaveLength(5);
  });

  it('returns an empty list when the profile is complete', () => {
    expect(
      getProfileCompletionTasks({
        email: 'a@b.com',
        full_name: 'Tess',
        phone: '0400',
        address: '1 Test St',
        postcode: '2000',
      }),
    ).toEqual([]);
  });

  it('names only the missing fields, in field order', () => {
    expect(getProfileCompletionTasks({ email: 'a@b.com', phone: '0400' })).toEqual([
      'Add full name',
      'Add address',
      'Add postcode',
    ]);
  });

  // BUG (copy): the null branch says "Add phone" while the per-field branch says
  // "Add phone number" for the same task, so the wording changes depending on
  // whether the profile row has loaded yet.
  it('BUG: the phone task is worded differently in the null branch', () => {
    expect(getProfileCompletionTasks(null)).toContain('Add phone');
    expect(getProfileCompletionTasks({})).toContain('Add phone number');
    expect(getProfileCompletionTasks({})).not.toContain('Add phone');
  });

  it('agrees with calculateProfileCompletion on how much is outstanding', () => {
    const partial = { email: 'a@b.com', full_name: 'Tess' };
    expect(getProfileCompletionTasks(partial)).toHaveLength(3);
    expect(calculateProfileCompletion(partial)).toBe(40);
  });
});

describe('checkLicenseExpired', () => {
  const past = '2000-01-01';
  const future = '2999-01-01';

  it('is true when the verification status itself says expired', () => {
    expect(checkLicenseExpired('expired', future)).toBe(true);
  });

  it('is true when the expiry date has passed, whatever the status says', () => {
    expect(checkLicenseExpired('verified', past)).toBe(true);
  });

  it('is false for a verified licence with a future expiry', () => {
    expect(checkLicenseExpired('verified', future)).toBe(false);
  });

  it('is false when nothing is known — unknown is not expired', () => {
    expect(checkLicenseExpired(null, null)).toBe(false);
    expect(checkLicenseExpired(undefined, undefined)).toBe(false);
    expect(checkLicenseExpired('pending', null)).toBe(false);
  });

  it('does not treat an unparseable expiry as expired', () => {
    // new Date('nonsense') is NaN, and every NaN comparison is false.
    expect(checkLicenseExpired('verified', 'nonsense')).toBe(false);
  });

  it('is false for an empty expiry string', () => {
    expect(checkLicenseExpired('verified', '')).toBe(false);
  });
});

describe('friendlyError — no usable message', () => {
  const DEFAULT = 'That didn\'t go through — check your connection and try again.';

  it('falls back when the input has no message at all', () => {
    expect(friendlyError('')).toBe(DEFAULT);
    expect(friendlyError(null)).toBe(DEFAULT);
    expect(friendlyError(undefined)).toBe(DEFAULT);
    expect(friendlyError({})).toBe(DEFAULT);
    expect(friendlyError(42)).toBe(DEFAULT);
  });

  it('prefers a caller-supplied fallback', () => {
    expect(friendlyError(null, 'Could not load your jobs.')).toBe('Could not load your jobs.');
  });
});

describe('friendlyError — userFacing pass-through', () => {
  // Copy our own edge functions wrote is already plain English and already says
  // what to do next. The keyword rules exist to translate TECHNICAL errors.
  it('returns a userFacing message verbatim even when it trips a keyword rule', () => {
    const msg = 'Add a payment method before you accept this quote.';
    expect(friendlyError({ message: msg, userFacing: true })).toBe(msg);
  });

  it('rewrites the same message when userFacing is not set', () => {
    const msg = 'Add a payment method before you accept this quote.';
    expect(friendlyError({ message: msg })).not.toBe(msg);
    expect(friendlyError({ message: msg })).toContain('processing your payment');
  });

  it('does not pass through when userFacing is merely truthy-ish', () => {
    const msg = 'Stripe could not do the thing.';
    expect(friendlyError({ message: msg, userFacing: 'yes' })).not.toBe(msg);
  });

  it('passes through a long userFacing message that would otherwise hit the fallback', () => {
    const msg =
      'The tradie changed the scope of this job, so the payment schedule column no longer '
      + 'matches the original quote. Review the variation before you release anything.';
    expect(msg.length).toBeGreaterThan(100);
    expect(friendlyError({ message: msg, userFacing: true })).toBe(msg);
  });
});

describe('friendlyError — Postgres constraint errors', () => {
  it('explains a foreign-key failure on account deletion in account terms', () => {
    const out = friendlyError('update or delete on table "profiles" violates foreign key constraint');
    expect(out).toContain('linked data');
    expect(out).not.toContain('foreign key');
  });

  it('uses the generic linked-record wording for an unrelated foreign key', () => {
    const out = friendlyError('insert on table "quotes" violates foreign key constraint "quotes_job_id_fkey"');
    expect(out).toBe('This item is linked to other records and cannot be removed right now. Please contact support if you need help.');
  });

  it('names the email field on a duplicate email', () => {
    expect(friendlyError('duplicate key value violates unique constraint "profiles_email_key"'))
      .toBe('This email address is already in use.');
  });

  it('names the phone field on a duplicate phone', () => {
    expect(friendlyError('duplicate key value violates unique constraint "profiles_phone_key"'))
      .toBe('This phone number is already in use.');
  });

  it('recognises the bare SQLSTATE 23505', () => {
    expect(friendlyError('23505')).toBe('This record already exists. Please check your details and try again.');
  });

  it('handles a not-null violation as missing information', () => {
    expect(friendlyError('null value in column "amount" violates not-null constraint'))
      .toBe('Some required information is missing. Please fill in all required fields.');
  });

  it('never leaks SQL jargon in any constraint branch', () => {
    const raws = [
      'update or delete on table "profiles" violates foreign key constraint',
      'duplicate key value violates unique constraint "profiles_email_key"',
      'null value in column "amount" violates not-null constraint',
    ];
    for (const raw of raws) {
      const out = friendlyError(raw).toLowerCase();
      expect(out).not.toContain('constraint');
      expect(out).not.toContain('column');
      expect(out).not.toContain('violates');
    }
  });
});

describe('friendlyError — auth and permission', () => {
  it('maps a permission-denied error to a permission message', () => {
    expect(friendlyError('permission denied for table jobs'))
      .toBe('You don\'t have permission to perform this action. Please sign in again or contact support.');
  });

  it('maps an RLS policy violation to the same permission message', () => {
    expect(friendlyError('new row violates row-level security policy for table "quotes"'))
      .toContain('permission');
  });

  it('maps an expired JWT to a session message', () => {
    expect(friendlyError('JWT expired')).toBe('Your session has expired. Please sign in again.');
  });

  it('maps a missing session to the same session message', () => {
    expect(friendlyError('User not authenticated')).toContain('sign in again');
  });

  // Ordering matters: "permission denied" is checked before the token rules, so
  // a message carrying both reads as permission, not as a stale session.
  it('prefers the permission wording when a message carries both signals', () => {
    expect(friendlyError('permission denied: token expired')).toContain('permission');
  });
});

describe('friendlyError — network and timeouts', () => {
  it('maps a failed fetch to a connection message', () => {
    expect(friendlyError('Failed to fetch'))
      .toBe('Unable to connect. Please check your internet connection and try again.');
  });

  it('maps a NetworkError to the same connection message', () => {
    expect(friendlyError('NetworkError when attempting to fetch the resource'))
      .toContain('internet connection');
  });

  it('maps a refused connection to the connection message', () => {
    expect(friendlyError('connect ECONNREFUSED 127.0.0.1:54321')).toContain('Unable to connect');
  });

  it('maps a timeout to a try-again message, distinct from an offline one', () => {
    expect(friendlyError('The operation timed out')).toBe('The request took too long. Please try again.');
    expect(friendlyError('Request timeout')).toBe('The request took too long. Please try again.');
  });

  it('unwraps an Error instance, not just a plain object', () => {
    expect(friendlyError(new Error('Failed to fetch'))).toContain('Unable to connect');
  });
});

describe('friendlyError — payments and subscriptions', () => {
  // Never surface a raw Stripe price id: subscriptions may simply not be
  // configured in this environment, which is not something the user did.
  it('hides a raw Stripe price id', () => {
    const out = friendlyError('No such price: price_1PabcDEFghiJKL');
    expect(out).toContain('Subscriptions');
    expect(out).not.toContain('price_1PabcDEFghiJKL');
  });

  it('catches the price-not-configured phrasing too', () => {
    expect(friendlyError('Stripe price not configured for this tier')).toContain('Subscriptions');
  });

  it('maps insufficient balance to a payment-method message', () => {
    expect(friendlyError('Insufficient available balance to complete the transfer'))
      .toBe('Payment could not be processed. Please try again or use a different payment method.');
  });

  it('maps a declined card to a card message', () => {
    expect(friendlyError('Your card was declined (card_declined)'))
      .toBe('Your card was declined. Please try a different payment method.');
  });

  it('maps a generic Stripe failure to a payment message', () => {
    expect(friendlyError('StripeInvalidRequestError: destination account is unavailable'))
      .toBe('There was a problem processing your payment. Please try again or contact support.');
  });

  it('checks the price rule before the generic payment rule', () => {
    // Both "price" and "stripe" appear; the price rule must win.
    expect(friendlyError('Stripe error: no such price: price_x')).toContain('Subscriptions');
  });
});

describe('friendlyError — server, rate limiting and uploads', () => {
  it('maps a 429 to a wait-and-retry message', () => {
    expect(friendlyError('429 Too Many Requests')).toBe('Too many requests. Please wait a moment and try again.');
    expect(friendlyError('rate limit exceeded')).toContain('wait a moment');
  });

  it('maps a 500 to a server message, distinct from a network one', () => {
    const out = friendlyError('Edge function returned status 500');
    expect(out).toBe('The server couldn\'t process that — try again shortly.');
    expect(out).not.toContain('internet connection');
  });

  it('maps an internal server error phrase to the server message', () => {
    expect(friendlyError('Internal Server Error')).toContain('server couldn\'t process');
  });

  it('maps an oversized file to a size message', () => {
    expect(friendlyError('File size exceeds the 5MB limit')).toBe('The file is too large. Please choose a smaller file.');
  });

  it('maps a failed upload to an upload message', () => {
    expect(friendlyError('Upload failed: storage object could not be written'))
      .toBe('File upload failed. Please try again.');
  });
});

describe('friendlyError — pass-through and final fallback', () => {
  it('passes a short, human-readable message straight through', () => {
    expect(friendlyError('Choose a start date before saving.')).toBe('Choose a start date before saving.');
  });

  it('does not pass through a short message carrying SQL jargon', () => {
    const out = friendlyError('relation "public.jobs_v2" does not exist');
    expect(out).toBe('That didn\'t go through — try again, or contact support if it keeps happening.');
  });

  it('rejects each jargon keyword individually', () => {
    for (const word of ['constraint', 'relation', 'column', 'table', 'schema']) {
      expect(friendlyError(`Odd failure mentioning a ${word} somewhere`))
        .toContain('contact support if it keeps happening');
    }
  });

  it('falls back on a long message even with no jargon', () => {
    const long = 'x'.repeat(150);
    expect(friendlyError(long)).not.toBe(long);
    expect(friendlyError(long)).toContain('contact support if it keeps happening');
  });

  it('passes through at 99 characters and falls back at 100', () => {
    const ninetyNine = 'y'.repeat(99);
    const hundred = 'y'.repeat(100);
    expect(friendlyError(ninetyNine)).toBe(ninetyNine);
    expect(friendlyError(hundred)).not.toBe(hundred);
  });

  it('uses the caller fallback at the end of the chain too', () => {
    expect(friendlyError('relation "jobs" does not exist', 'Could not load your jobs.'))
      .toBe('Could not load your jobs.');
  });

  it('never returns an empty string for any input shape', () => {
    const inputs: unknown[] = [
      '', null, undefined, 0, {}, { message: '' }, new Error(''),
      'permission denied', 'Failed to fetch', 'x'.repeat(200),
    ];
    for (const input of inputs) {
      expect(friendlyError(input).length).toBeGreaterThan(0);
    }
  });
});
