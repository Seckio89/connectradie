import { getTradieRating, getTradieReviews, canUserReviewJob } from '../reviews';

// Mock the supabase module
vi.mock('../supabase', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'gte', 'lte', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Default resolve
    chain._response = { data: null, error: null };
    chain.then = function (resolve: (v: unknown) => void) {
      resolve((chain as Record<string, unknown>)._response);
      return Promise.resolve((chain as Record<string, unknown>)._response);
    };
    return chain;
  };

  const fromChains: Record<string, ReturnType<typeof mockChain>> = {};

  return {
    supabase: {
      from: vi.fn((table: string) => {
        fromChains[table] = mockChain();
        return fromChains[table];
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      _getChain: (table: string) => fromChains[table],
    },
  };
});

// Import the mocked module to configure responses
import { supabase } from '../supabase';

describe('reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTradieRating', () => {
    it('returns rating data for a tradie', async () => {
      const mockRating = {
        tradie_id: 'tradie-123',
        total_reviews: 10,
        average_rating: 4.5,
        five_star_count: 6,
        four_star_count: 3,
        three_star_count: 1,
        two_star_count: 0,
        one_star_count: 0,
      };

      // Configure the chain response
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        const methods = ['select', 'eq', 'maybeSingle'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.then = function (resolve: (v: unknown) => void) {
          resolve({ data: mockRating, error: null });
          return Promise.resolve({ data: mockRating, error: null });
        };
        return chain as ReturnType<typeof supabase.from>;
      });

      const result = await getTradieRating('tradie-123');
      expect(result).toEqual(mockRating);
      expect(supabase.from).toHaveBeenCalledWith('tradie_ratings');
    });

    it('returns null on error', async () => {
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        const methods = ['select', 'eq', 'maybeSingle'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.then = function (resolve: (v: unknown) => void) {
          resolve({ data: null, error: { message: 'DB error' } });
          return Promise.resolve({ data: null, error: { message: 'DB error' } });
        };
        return chain as ReturnType<typeof supabase.from>;
      });

      const result = await getTradieRating('bad-id');
      expect(result).toBeNull();
    });
  });

  describe('getTradieReviews', () => {
    it('returns reviews list', async () => {
      const mockReviews = [
        { id: '1', rating: 5, comment: 'Great!', client: { full_name: 'John' } },
        { id: '2', rating: 4, comment: 'Good', client: { full_name: 'Jane' } },
      ];

      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        const methods = ['select', 'eq', 'order'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.then = function (resolve: (v: unknown) => void) {
          resolve({ data: mockReviews, error: null });
          return Promise.resolve({ data: mockReviews, error: null });
        };
        return chain as ReturnType<typeof supabase.from>;
      });

      const result = await getTradieReviews('tradie-123');
      expect(result).toEqual(mockReviews);
      expect(result).toHaveLength(2);
    });

    it('returns empty array on error', async () => {
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        const methods = ['select', 'eq', 'order'];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.then = function (resolve: (v: unknown) => void) {
          resolve({ data: null, error: { message: 'Error' } });
          return Promise.resolve({ data: null, error: { message: 'Error' } });
        };
        return chain as ReturnType<typeof supabase.from>;
      });

      const result = await getTradieReviews('bad-id');
      expect(result).toEqual([]);
    });
  });

  describe('canUserReviewJob', () => {
    it('returns false when no user is logged in', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as never);

      const result = await canUserReviewJob('job-123');
      expect(result).toBe(false);
    });
  });
});
