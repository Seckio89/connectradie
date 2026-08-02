// ─────────────────────────────────────────────────────────────────────────────
// The release window is declared TWICE — once for the UI (src/lib/releaseWindow
// .ts) and once for the cron that actually moves the money
// (supabase/functions/auto-release-payments). Both files carry a comment asking
// the next person to keep them in sync, and a comment is the only thing that
// has ever enforced it.
//
// Drift here is silent and expensive in both directions:
//   • edge fn LONGER than the UI  → the app promises "5 hours", the money sits
//     unreleased past that, and the tradie is told a number that isn't true.
//   • edge fn SHORTER than the UI → escrow releases while the client still
//     believes they have time to raise a dispute. That is the client's money
//     leaving early, on a platform whose whole pitch is that it doesn't.
//
// TypeScript cannot see across the boundary: the edge function is Deno, it is
// not in tsconfig, and the constant is a local `const` inside the handler
// rather than an export. So this test reads the edge function as TEXT and
// compares the two numbers. That is deliberately crude — it is the only thing
// that works across the runtime boundary, and it fails loudly the moment
// someone edits one side.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RELEASE_WINDOW_HOURS,
  RELEASE_WINDOW_MS,
  RELEASE_WINDOW_LABEL,
} from '../releaseWindow';

const EDGE_FN = 'supabase/functions/auto-release-payments/index.ts';

function edgeFunctionSource(): string {
  return readFileSync(resolve(process.cwd(), EDGE_FN), 'utf8');
}

describe('release window — the UI constant', () => {
  it('derives ms and label from the hours, so one edit moves all three', () => {
    expect(RELEASE_WINDOW_MS).toBe(RELEASE_WINDOW_HOURS * 60 * 60 * 1000);
    expect(RELEASE_WINDOW_LABEL).toBe(`${RELEASE_WINDOW_HOURS} hours`);
  });

  it('is a positive whole number of hours', () => {
    // A zero or negative window would auto-release instantly on completion,
    // removing the client's review period altogether.
    expect(RELEASE_WINDOW_HOURS).toBeGreaterThan(0);
    expect(Number.isInteger(RELEASE_WINDOW_HOURS)).toBe(true);
  });
});

describe('release window — cross-runtime sync with the payout cron', () => {
  it('declares RELEASE_WINDOW_HOURS in the edge function at all', () => {
    // If this fails the constant was renamed or inlined, and the sync assertion
    // below would silently start passing against nothing.
    const src = edgeFunctionSource();
    expect(src).toMatch(/RELEASE_WINDOW_HOURS\s*=\s*\d+/);
  });

  it('uses the same number of hours as the UI', () => {
    const src = edgeFunctionSource();
    const declared = /RELEASE_WINDOW_HOURS\s*=\s*(\d+)/.exec(src);
    expect(declared).not.toBeNull();

    const edgeHours = Number(declared![1]);
    expect(edgeHours).toBe(RELEASE_WINDOW_HOURS);
  });

  it('still computes its cutoff from that constant, not a hard-coded number', () => {
    // The sync check above is worthless if the cron stops USING the constant —
    // e.g. someone replaces the cutoff maths with a literal. Assert the cutoff
    // is still derived from RELEASE_WINDOW_HOURS.
    const src = edgeFunctionSource();
    expect(src).toMatch(/cutoff[\s\S]{0,120}RELEASE_WINDOW_HOURS\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
});
