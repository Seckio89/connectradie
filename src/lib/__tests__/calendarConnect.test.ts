// Tests for bringing the tradie back after Google consent.
//
// The bug these lock down is not a wrong value — it is a user with no way out.
// On Android the consent page opens in a Chrome Custom Tab, where the
// confirmation page's `window.close()` does nothing and back walks up the OAuth
// chain, so the only escape is the app closing the tab itself. That decision
// ("has the callback landed yet?") is what is asserted here, with the clock,
// the network and Capacitor all injected — none of which exist in CI, which is
// precisely why this would otherwise only ever be tested by hand on a phone.

import { describe, it, expect, vi } from 'vitest';
import {
  connectionChanged,
  pollForConnection,
  type ConnectionMarker,
  type PollDeps,
} from '../calendarConnect';

const BEFORE: ConnectionMarker = { id: 'int-1', updated_at: '2026-08-26T00:00:00.000Z' };

/** A deps object with a scripted sequence of marker reads and a fake clock. */
function deps(
  reads: ConnectionMarker[],
  over: Partial<PollDeps> = {},
): PollDeps & { elapsed: () => number; readCount: () => number } {
  let clock = 0;
  let i = 0;
  return {
    readMarker: () => {
      const value = reads[Math.min(i, reads.length - 1)];
      i++;
      return Promise.resolve(value);
    },
    sleep: (ms: number) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    isCancelled: () => false,
    ...over,
    elapsed: () => clock,
    readCount: () => i,
  };
}

describe('connectionChanged', () => {
  it('is false while nothing is stored — consent has not completed', () => {
    expect(connectionChanged(null, null)).toBe(false);
    expect(connectionChanged(BEFORE, null)).toBe(false);
  });

  it('is true for a first-ever connection', () => {
    expect(connectionChanged(null, BEFORE)).toBe(true);
  });

  it('is true when a reconnect updates the SAME row in place', () => {
    // The id does not change on a reconnect, so watching the id alone would
    // watch forever and the tab would never close.
    expect(
      connectionChanged(BEFORE, { id: 'int-1', updated_at: '2026-08-26T00:29:36.000Z' }),
    ).toBe(true);
  });

  it('is true when disconnect-then-reconnect creates a NEW row', () => {
    // This is what actually happened on 2026-08-26: a different id entirely.
    expect(
      connectionChanged(BEFORE, { id: 'int-2', updated_at: '2026-08-26T00:29:16.000Z' }),
    ).toBe(true);
  });

  it('is false when the row is untouched', () => {
    expect(connectionChanged(BEFORE, { ...BEFORE })).toBe(false);
  });
});

describe('pollForConnection', () => {
  it('returns connected as soon as the row changes, without sleeping first', async () => {
    const d = deps([{ id: 'int-2', updated_at: '2026-08-26T00:29:16.000Z' }]);
    await expect(pollForConnection(BEFORE, d)).resolves.toBe('connected');
    expect(d.elapsed()).toBe(0);
    expect(d.readCount()).toBe(1);
  });

  it('keeps watching while the row is unchanged', async () => {
    const d = deps([BEFORE, BEFORE, { id: 'int-1', updated_at: '2026-08-26T00:30:00.000Z' }]);
    await expect(pollForConnection(BEFORE, d)).resolves.toBe('connected');
    expect(d.readCount()).toBe(3);
  });

  it('keeps watching while consent has produced nothing yet', async () => {
    const d = deps([null, null, BEFORE], {});
    await expect(pollForConnection(null, d)).resolves.toBe('connected');
  });

  it('gives up after the timeout instead of polling forever', async () => {
    const d = deps([BEFORE]);
    await expect(
      pollForConnection(BEFORE, d, { intervalMs: 1000, timeoutMs: 5000 }),
    ).resolves.toBe('timeout');
    expect(d.elapsed()).toBe(5000);
  });

  it('stops immediately when the tradie dismisses the tab', async () => {
    const readMarker = vi.fn(() => Promise.resolve(BEFORE));
    const d = deps([BEFORE], { isCancelled: () => true, readMarker });
    await expect(pollForConnection(BEFORE, d)).resolves.toBe('cancelled');
    // Cancellation is checked BEFORE the first read, so a dismissal that beats
    // the first tick costs no query at all.
    expect(readMarker).not.toHaveBeenCalled();
  });

  it('stops on a dismissal that happens mid-watch', async () => {
    let dismissed = false;
    const d = deps([BEFORE, BEFORE, BEFORE], {
      isCancelled: () => dismissed,
      sleep: () => {
        dismissed = true; // the tab is dismissed while we were sleeping
        return Promise.resolve();
      },
      now: () => 0,
    });
    await expect(pollForConnection(BEFORE, d)).resolves.toBe('cancelled');
  });

  it('treats an unreadable row as "nothing yet" rather than connected', async () => {
    // readConnectionMarker swallows errors into null; a null must never be
    // mistaken for a completed consent.
    const d = deps([null, null, null]);
    await expect(
      pollForConnection(BEFORE, d, { intervalMs: 10, timeoutMs: 20 }),
    ).resolves.toBe('timeout');
  });
});

describe('resolveOutcome', () => {
  it('upgrades a cancelled watch whose row changed into connected', async () => {
    // The intent-return destroys the tab → browserFinished → the poll reads as
    // cancelled, on a connect that SUCCEEDED. The final re-read catches it.
    const { resolveOutcome } = await import('../calendarConnect');
    expect(
      resolveOutcome('cancelled', BEFORE, { id: 'int-2', updated_at: '2026-08-26T02:51:48.000Z' }),
    ).toBe('connected');
  });

  it('keeps a cancelled watch cancelled when nothing landed', async () => {
    const { resolveOutcome } = await import('../calendarConnect');
    expect(resolveOutcome('cancelled', BEFORE, { ...BEFORE })).toBe('cancelled');
    expect(resolveOutcome('cancelled', BEFORE, null)).toBe('cancelled');
  });

  it('never rewrites connected or timeout', async () => {
    const { resolveOutcome } = await import('../calendarConnect');
    expect(resolveOutcome('connected', BEFORE, { ...BEFORE })).toBe('connected');
    expect(
      resolveOutcome('timeout', BEFORE, { id: 'int-2', updated_at: '2026-08-26T02:51:48.000Z' }),
    ).toBe('timeout');
  });
});
