import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  redactName,
  extractSuburb,
  recordProfileView,
  getDailyViewCount,
  hasEngagement,
  canViewProfile,
  getRemainingViews,
  DAILY_VIEW_LIMIT_VALUE,
} from '../contactGating';

// ---------------------------------------------------------------------------
// Mock supabase module (same pattern as reviews.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../supabase', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'insert', 'update', 'delete', 'order', 'limit', 'single', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain._response = { data: null, error: null };
    chain.then = function (resolve: (v: unknown) => void) {
      resolve((chain as Record<string, unknown>)._response);
      return Promise.resolve((chain as Record<string, unknown>)._response);
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn(() => mockChain()),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

import { supabase } from '../supabase';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contactGating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // redactName
  // -----------------------------------------------------------------------
  describe('redactName', () => {
    it('returns "Tradie" for null input', () => {
      expect(redactName(null)).toBe('Tradie');
    });

    it('returns "Tradie" for undefined input', () => {
      expect(redactName(undefined)).toBe('Tradie');
    });

    it('returns "Tradie" for empty string', () => {
      expect(redactName('')).toBe('Tradie');
    });

    it('returns single name unchanged', () => {
      expect(redactName('John')).toBe('John');
    });

    it('redacts last name to initial with period', () => {
      expect(redactName('John Smith')).toBe('John S.');
    });

    it('handles names with multiple parts, using last part initial', () => {
      expect(redactName('John Michael Smith')).toBe('John S.');
    });

    it('trims whitespace around the name', () => {
      expect(redactName('  John Smith  ')).toBe('John S.');
    });

    it('handles multiple spaces between name parts', () => {
      expect(redactName('John   Smith')).toBe('John S.');
    });
  });

  // -----------------------------------------------------------------------
  // extractSuburb
  // -----------------------------------------------------------------------
  describe('extractSuburb', () => {
    it('returns empty string for null input', () => {
      expect(extractSuburb(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(extractSuburb(undefined)).toBe('');
    });

    it('returns empty string for empty string input', () => {
      expect(extractSuburb('')).toBe('');
    });

    it('returns first part when no comma present', () => {
      expect(extractSuburb('Sydney')).toBe('Sydney');
    });

    it('returns second-to-last part for two comma-separated parts', () => {
      expect(extractSuburb('Bondi, Sydney')).toBe('Bondi');
    });

    it('returns suburb before state/postcode pattern', () => {
      // "123 Main St, Bondi, NSW 2026"
      // parts = ["123 Main St", "Bondi", "NSW 2026"]
      // secondLast = "Bondi", which doesn't match state/postcode pattern
      expect(extractSuburb('123 Main St, Bondi, NSW 2026')).toBe('Bondi');
    });

    it('handles state/postcode in second-to-last position with 3+ parts', () => {
      // "123 Main St, Bondi, NSW 2026, Australia"
      // parts = ["123 Main St", "Bondi", "NSW 2026", "Australia"]
      // secondLast = "NSW 2026" matches statePostcodePattern, and parts.length >= 3
      // returns parts[parts.length - 3] = "Bondi"
      expect(extractSuburb('123 Main St, Bondi, NSW 2026, Australia')).toBe('Bondi');
    });

    it('extracts suburb from address with state but no commas using regex fallback', () => {
      expect(extractSuburb('Bondi NSW 2026')).toBe('Bondi');
    });

    it('handles VIC state code', () => {
      expect(extractSuburb('Richmond VIC 3121')).toBe('Richmond');
    });

    it('handles QLD state code', () => {
      expect(extractSuburb('Surfers Paradise QLD 4217')).toBe('Surfers Paradise');
    });

    it('extracts suburb from complex address with state regex fallback', () => {
      expect(extractSuburb('42 George St Parramatta NSW 2150')).toBe('42 George St Parramatta');
    });

    it('returns the second-to-last comma part when no state postcode match', () => {
      expect(extractSuburb('Unit 5, 123 Fake Street, Melbourne')).toBe('123 Fake Street');
    });
  });

  // -----------------------------------------------------------------------
  // recordProfileView
  // -----------------------------------------------------------------------
  describe('recordProfileView', () => {
    it('calls supabase insert with viewer and tradie IDs', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as unknown as ReturnType<typeof supabase.from>);

      await recordProfileView('viewer-1', 'tradie-1');

      expect(supabase.from).toHaveBeenCalledWith('profile_views');
      expect(mockInsert).toHaveBeenCalledWith({
        viewer_id: 'viewer-1',
        tradie_id: 'tradie-1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // getDailyViewCount
  // -----------------------------------------------------------------------
  describe('getDailyViewCount', () => {
    it('returns the count from the RPC call', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 3,
        error: null,
      } as never);

      const result = await getDailyViewCount('viewer-1');
      expect(result).toBe(3);
      expect(supabase.rpc).toHaveBeenCalledWith('get_daily_profile_view_count', {
        viewer_uuid: 'viewer-1',
      });
    });

    it('returns 0 when RPC returns null data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as never);

      const result = await getDailyViewCount('viewer-1');
      expect(result).toBe(0);
    });

    it('returns 0 on error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      } as never);

      const result = await getDailyViewCount('viewer-1');
      expect(result).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // hasEngagement
  // -----------------------------------------------------------------------
  describe('hasEngagement', () => {
    it('returns true when user has engagement', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: true,
        error: null,
      } as never);

      const result = await hasEngagement('user-1');
      expect(result).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('has_user_engagement', {
        user_uuid: 'user-1',
      });
    });

    it('returns false when user has no engagement', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: false,
        error: null,
      } as never);

      const result = await hasEngagement('user-1');
      expect(result).toBe(false);
    });

    it('returns false when RPC returns null data', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as never);

      const result = await hasEngagement('user-1');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      } as never);

      const result = await hasEngagement('user-1');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // canViewProfile
  // -----------------------------------------------------------------------
  describe('canViewProfile', () => {
    it('returns true when user has engagement (regardless of view count)', async () => {
      // First rpc call: hasEngagement -> true
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: true,
        error: null,
      } as never);

      const result = await canViewProfile('user-1');
      expect(result).toBe(true);
    });

    it('returns true when not engaged but daily view count is below limit', async () => {
      // First rpc call: hasEngagement -> false
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: false,
        error: null,
      } as never);
      // Second rpc call: getDailyViewCount -> 2
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 2,
        error: null,
      } as never);

      const result = await canViewProfile('user-1');
      expect(result).toBe(true);
    });

    it('returns false when not engaged and daily view count is at the limit', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: false,
        error: null,
      } as never);
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 5,
        error: null,
      } as never);

      const result = await canViewProfile('user-1');
      expect(result).toBe(false);
    });

    it('returns false when not engaged and daily view count exceeds limit', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: false,
        error: null,
      } as never);
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 10,
        error: null,
      } as never);

      const result = await canViewProfile('user-1');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getRemainingViews
  // -----------------------------------------------------------------------
  describe('getRemainingViews', () => {
    it('returns remaining views when count is below limit', () => {
      expect(getRemainingViews(2)).toBe(3);
    });

    it('returns 0 when count equals the limit', () => {
      expect(getRemainingViews(5)).toBe(0);
    });

    it('returns 0 when count exceeds the limit (never negative)', () => {
      expect(getRemainingViews(10)).toBe(0);
    });

    it('returns full limit when count is 0', () => {
      expect(getRemainingViews(0)).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // DAILY_VIEW_LIMIT_VALUE
  // -----------------------------------------------------------------------
  describe('DAILY_VIEW_LIMIT_VALUE', () => {
    it('equals 5', () => {
      expect(DAILY_VIEW_LIMIT_VALUE).toBe(5);
    });
  });
});
