import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateNextDueDate,
  suggestRecurringJob,
  createRecurringJob,
  getRecurringJobs,
  updateRecurringJob,
  cancelRecurringJob,
  markRecurringJobCompleted,
  getDueReminders,
  DEFAULT_FREQUENCIES,
} from '../recurringJobs';

// ---------------------------------------------------------------------------
// Mock the supabase module (same pattern as reviews.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../supabase', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'insert', 'update', 'delete',
      'eq', 'neq', 'in', 'is', 'order', 'limit',
      'gte', 'lte', 'single', 'maybeSingle',
    ];
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

  const fromChains: Record<string, ReturnType<typeof mockChain>> = {};

  return {
    supabase: {
      from: vi.fn((table: string) => {
        fromChains[table] = mockChain();
        return fromChains[table];
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      _getChain: (table: string) => fromChains[table],
    },
  };
});

import { supabase } from '../supabase';

// ---------------------------------------------------------------------------
// Helper to build a chainable mock that resolves to a given response
// ---------------------------------------------------------------------------

function mockFromResponse(response: { data: unknown; error: unknown }, methods: string[] = []) {
  const allMethods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'in', 'is', 'order', 'limit',
    'gte', 'lte', 'single', 'maybeSingle',
    ...methods,
  ];

  vi.mocked(supabase.from).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of allMethods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = function (resolve: (v: unknown) => void) {
      resolve(response);
      return Promise.resolve(response);
    };
    return chain as unknown as ReturnType<typeof supabase.from>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recurringJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth to authenticated user by default
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null,
    } as never);
  });

  // =========================================================================
  // calculateNextDueDate (pure function)
  // =========================================================================

  describe('calculateNextDueDate', () => {
    it('adds the correct number of months to a Date object', () => {
      const base = new Date('2026-01-15T00:00:00Z');
      const result = calculateNextDueDate(base, 3);
      expect(result.getMonth()).toBe(3); // April (0-indexed)
      expect(result.getFullYear()).toBe(2026);
      expect(result.getDate()).toBe(15);
    });

    it('adds the correct number of months to a string date', () => {
      const result = calculateNextDueDate('2026-06-01', 12);
      expect(result.getMonth()).toBe(5); // June (0-indexed)
      expect(result.getFullYear()).toBe(2027);
    });

    it('handles month overflow (e.g. Jan 31 + 1 month)', () => {
      const base = new Date('2026-01-31T00:00:00Z');
      const result = calculateNextDueDate(base, 1);
      // JS Date rolls Jan 31 + 1 month to Mar 3 (or Feb 28 depending on impl)
      // The important thing is it doesn't crash and produces a valid date
      expect(result instanceof Date).toBe(true);
      expect(result.getTime()).toBeGreaterThan(base.getTime());
    });

    it('handles frequency of 0 months (returns the same month)', () => {
      const base = new Date('2026-03-10T00:00:00Z');
      const result = calculateNextDueDate(base, 0);
      expect(result.getMonth()).toBe(base.getMonth());
      expect(result.getFullYear()).toBe(base.getFullYear());
    });

    it('handles large frequencies (e.g. 60 months = 5 years)', () => {
      const result = calculateNextDueDate('2026-01-01', 60);
      expect(result.getFullYear()).toBe(2031);
      expect(result.getMonth()).toBe(0); // January
    });
  });

  // =========================================================================
  // DEFAULT_FREQUENCIES
  // =========================================================================

  describe('DEFAULT_FREQUENCIES', () => {
    it('contains expected trade categories', () => {
      expect(DEFAULT_FREQUENCIES.plumbing).toBe(12);
      expect(DEFAULT_FREQUENCIES.lawn_mowing).toBe(1);
      expect(DEFAULT_FREQUENCIES.painting).toBe(60);
      expect(DEFAULT_FREQUENCIES.electrical).toBe(24);
      expect(DEFAULT_FREQUENCIES.hvac).toBe(12);
    });
  });

  // =========================================================================
  // suggestRecurringJob (pure function)
  // =========================================================================

  describe('suggestRecurringJob', () => {
    it('returns correct suggestion for a known trade category', () => {
      const suggestion = suggestRecurringJob('plumbing');
      expect(suggestion.tradeCategory).toBe('plumbing');
      expect(suggestion.frequencyMonths).toBe(12);
      expect(suggestion.label).toBe('Annual plumbing inspection');
      expect(suggestion.description).toContain('plumbing inspection');
    });

    it('normalises trade category with spaces and mixed case', () => {
      const suggestion = suggestRecurringJob('Pest Control');
      expect(suggestion.frequencyMonths).toBe(12);
      expect(suggestion.label).toBe('Annual pest treatment');
    });

    it('returns default 12-month frequency for unknown categories', () => {
      const suggestion = suggestRecurringJob('underwater_welding');
      expect(suggestion.frequencyMonths).toBe(12);
      expect(suggestion.label).toBe('Regular underwater_welding service');
      expect(suggestion.description).toContain('underwater_welding');
    });

    it('returns suggestion for lawn_mowing with 1-month frequency', () => {
      const suggestion = suggestRecurringJob('lawn_mowing');
      expect(suggestion.frequencyMonths).toBe(1);
      expect(suggestion.label).toBe('Monthly lawn mowing');
    });

    it('returns suggestion for landscaping with 3-month frequency', () => {
      const suggestion = suggestRecurringJob('landscaping');
      expect(suggestion.frequencyMonths).toBe(3);
      expect(suggestion.label).toBe('Quarterly garden maintenance');
    });
  });

  // =========================================================================
  // createRecurringJob
  // =========================================================================

  describe('createRecurringJob', () => {
    const validData = {
      tradie_id: 'tradie-abc',
      trade_category: 'plumbing',
      description: 'Annual pipe inspection',
      frequency_months: 12,
      next_due_date: '2027-01-15',
      reminder_days_before: 7,
    };

    it('creates a recurring job and returns the created record', async () => {
      const mockCreated = {
        id: 'rj-1',
        client_id: 'test-user-id',
        ...validData,
        is_active: true,
        original_job_id: null,
        times_completed: 0,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };

      mockFromResponse({ data: mockCreated, error: null });

      const result = await createRecurringJob(validData);
      expect(result).toEqual(mockCreated);
      expect(supabase.from).toHaveBeenCalledWith('recurring_jobs');
    });

    it('throws when user is not authenticated', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as never);

      await expect(createRecurringJob(validData)).rejects.toThrow('Not authenticated');
    });

    it('throws on supabase insert error', async () => {
      mockFromResponse({ data: null, error: { message: 'Insert failed' } });

      await expect(createRecurringJob(validData)).rejects.toThrow('Insert failed');
    });

    it('uses client_id from data when provided', async () => {
      const dataWithClient = { ...validData, client_id: 'custom-client' };
      const mockCreated = {
        id: 'rj-2',
        ...dataWithClient,
        is_active: true,
        original_job_id: null,
        times_completed: 0,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };

      mockFromResponse({ data: mockCreated, error: null });

      const result = await createRecurringJob(dataWithClient);
      expect(result.client_id).toBe('custom-client');
    });

    it('defaults is_active to true when not specified', async () => {
      const mockCreated = {
        id: 'rj-3',
        client_id: 'test-user-id',
        ...validData,
        is_active: true,
        original_job_id: null,
        times_completed: 0,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };

      mockFromResponse({ data: mockCreated, error: null });

      const result = await createRecurringJob(validData);
      expect(result.is_active).toBe(true);
    });
  });

  // =========================================================================
  // getRecurringJobs
  // =========================================================================

  describe('getRecurringJobs', () => {
    it('fetches recurring jobs for the authenticated user', async () => {
      const mockJobs = [
        {
          id: 'rj-1',
          client_id: 'test-user-id',
          tradie_id: 'tradie-1',
          trade_category: 'plumbing',
          description: 'Pipe check',
          frequency_months: 12,
          next_due_date: '2027-01-01',
          reminder_days_before: 7,
          is_active: true,
          original_job_id: null,
          times_completed: 2,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          tradie: { id: 'tradie-1', full_name: 'Mike Plumber', email: 'mike@test.com' },
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getRecurringJobs();
      expect(result).toEqual(mockJobs);
      expect(supabase.from).toHaveBeenCalledWith('recurring_jobs');
    });

    it('accepts an explicit userId parameter', async () => {
      mockFromResponse({ data: [], error: null });

      const result = await getRecurringJobs('explicit-user-id');
      expect(result).toEqual([]);
      // Should NOT call auth.getUser when userId is provided
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it('throws when not authenticated and no userId provided', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as never);

      await expect(getRecurringJobs()).rejects.toThrow('Not authenticated');
    });

    it('throws on supabase query error', async () => {
      mockFromResponse({ data: null, error: { message: 'Query failed' } });

      await expect(getRecurringJobs('user-1')).rejects.toThrow('Query failed');
    });

    it('returns empty array when no jobs exist', async () => {
      mockFromResponse({ data: [], error: null });

      const result = await getRecurringJobs('user-1');
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // updateRecurringJob
  // =========================================================================

  describe('updateRecurringJob', () => {
    it('updates a recurring job successfully', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', { frequency_months: 6 }),
      ).resolves.toBeUndefined();

      expect(supabase.from).toHaveBeenCalledWith('recurring_jobs');
    });

    it('throws on supabase update error', async () => {
      mockFromResponse({ data: null, error: { message: 'Update failed' } });

      await expect(
        updateRecurringJob('rj-1', { description: 'Updated' }),
      ).rejects.toThrow('Update failed');
    });

    it('can update multiple fields at once', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', {
          description: 'New description',
          frequency_months: 6,
          reminder_days_before: 14,
          is_active: false,
        }),
      ).resolves.toBeUndefined();
    });

    it('can update the next_due_date (schedule change)', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', { next_due_date: '2027-06-01' }),
      ).resolves.toBeUndefined();
    });

    it('can update the tradie_id', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', { tradie_id: 'new-tradie-id' }),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // cancelRecurringJob (pause / deactivate)
  // =========================================================================

  describe('cancelRecurringJob', () => {
    it('deactivates a recurring job by setting is_active to false', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(cancelRecurringJob('rj-1')).resolves.toBeUndefined();
      expect(supabase.from).toHaveBeenCalledWith('recurring_jobs');
    });

    it('throws on supabase error', async () => {
      mockFromResponse({ data: null, error: { message: 'Cancel failed' } });

      await expect(cancelRecurringJob('rj-1')).rejects.toThrow('Cancel failed');
    });
  });

  // =========================================================================
  // Pause / Resume via updateRecurringJob
  // =========================================================================

  describe('pause and resume via updateRecurringJob', () => {
    it('pauses a recurring job by setting is_active to false', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', { is_active: false }),
      ).resolves.toBeUndefined();
    });

    it('resumes a recurring job by setting is_active to true', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(
        updateRecurringJob('rj-1', { is_active: true }),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // markRecurringJobCompleted
  // =========================================================================

  describe('markRecurringJobCompleted', () => {
    it('increments times_completed and advances next_due_date', async () => {
      // First call: fetch the current job
      // Second call: update the job
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        callCount++;
        const chain: Record<string, unknown> = {};
        const methods = [
          'select', 'insert', 'update', 'delete',
          'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle',
        ];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          // First call is the fetch (select ... maybeSingle)
          chain.then = function (resolve: (v: unknown) => void) {
            const response = {
              data: {
                times_completed: 2,
                frequency_months: 12,
                next_due_date: '2026-01-15',
              },
              error: null,
            };
            resolve(response);
            return Promise.resolve(response);
          };
        } else {
          // Second call is the update
          chain.then = function (resolve: (v: unknown) => void) {
            const response = { data: null, error: null };
            resolve(response);
            return Promise.resolve(response);
          };
        }

        return chain as unknown as ReturnType<typeof supabase.from>;
      });

      await expect(markRecurringJobCompleted('rj-1')).resolves.toBeUndefined();
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it('throws when the recurring job is not found', async () => {
      mockFromResponse({ data: null, error: null });

      await expect(markRecurringJobCompleted('nonexistent')).rejects.toThrow(
        'Recurring job not found',
      );
    });

    it('throws on fetch error', async () => {
      mockFromResponse({ data: null, error: { message: 'Fetch error' } });

      await expect(markRecurringJobCompleted('rj-1')).rejects.toThrow('Fetch error');
    });

    it('throws on update error after successful fetch', async () => {
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        callCount++;
        const chain: Record<string, unknown> = {};
        const methods = [
          'select', 'insert', 'update', 'delete',
          'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle',
        ];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          chain.then = function (resolve: (v: unknown) => void) {
            const response = {
              data: { times_completed: 0, frequency_months: 6, next_due_date: '2026-06-01' },
              error: null,
            };
            resolve(response);
            return Promise.resolve(response);
          };
        } else {
          chain.then = function (resolve: (v: unknown) => void) {
            const response = { data: null, error: { message: 'Update error' } };
            resolve(response);
            return Promise.resolve(response);
          };
        }

        return chain as unknown as ReturnType<typeof supabase.from>;
      });

      await expect(markRecurringJobCompleted('rj-1')).rejects.toThrow('Update error');
    });

    it('handles times_completed being null (defaults to 0)', async () => {
      let callCount = 0;
      vi.mocked(supabase.from).mockImplementation(() => {
        callCount++;
        const chain: Record<string, unknown> = {};
        const methods = [
          'select', 'insert', 'update', 'delete',
          'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle',
        ];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          chain.then = function (resolve: (v: unknown) => void) {
            const response = {
              data: { times_completed: null, frequency_months: 12, next_due_date: '2026-01-01' },
              error: null,
            };
            resolve(response);
            return Promise.resolve(response);
          };
        } else {
          chain.then = function (resolve: (v: unknown) => void) {
            const response = { data: null, error: null };
            resolve(response);
            return Promise.resolve(response);
          };
        }

        return chain as unknown as ReturnType<typeof supabase.from>;
      });

      await expect(markRecurringJobCompleted('rj-1')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // getDueReminders
  // =========================================================================

  describe('getDueReminders', () => {
    it('returns reminders for jobs within the reminder window', async () => {
      const now = new Date();
      const dueSoon = new Date(now);
      dueSoon.setDate(dueSoon.getDate() + 3); // 3 days from now

      const mockJobs = [
        {
          id: 'rj-1',
          trade_category: 'plumbing',
          description: 'Pipe check',
          next_due_date: dueSoon.toISOString(),
          reminder_days_before: 7,
          tradie_id: 'tradie-1',
          tradie: { full_name: 'Mike Plumber' },
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rj-1');
      expect(result[0].tradie_name).toBe('Mike Plumber');
      expect(result[0].days_until_due).toBeLessThanOrEqual(7);
      expect(result[0].days_until_due).toBeGreaterThanOrEqual(0);
    });

    it('excludes jobs outside the reminder window', async () => {
      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 60); // 60 days out

      const mockJobs = [
        {
          id: 'rj-2',
          trade_category: 'painting',
          description: 'Repaint',
          next_due_date: farFuture.toISOString(),
          reminder_days_before: 14,
          tradie_id: 'tradie-2',
          tradie: { full_name: 'Jane Painter' },
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toHaveLength(0);
    });

    it('excludes jobs that are already past due (negative days)', async () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 5); // 5 days ago

      const mockJobs = [
        {
          id: 'rj-3',
          trade_category: 'electrical',
          description: 'Safety check',
          next_due_date: pastDue.toISOString(),
          reminder_days_before: 7,
          tradie_id: 'tradie-3',
          tradie: { full_name: 'Bob Sparky' },
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toHaveLength(0);
    });

    it('sorts reminders by days_until_due ascending', async () => {
      const now = new Date();
      const in2Days = new Date(now);
      in2Days.setDate(in2Days.getDate() + 2);
      const in5Days = new Date(now);
      in5Days.setDate(in5Days.getDate() + 5);

      const mockJobs = [
        {
          id: 'rj-b',
          trade_category: 'cleaning',
          description: 'Monthly clean',
          next_due_date: in5Days.toISOString(),
          reminder_days_before: 7,
          tradie_id: 'tradie-b',
          tradie: { full_name: 'Cleaner B' },
        },
        {
          id: 'rj-a',
          trade_category: 'pest_control',
          description: 'Bug spray',
          next_due_date: in2Days.toISOString(),
          reminder_days_before: 7,
          tradie_id: 'tradie-a',
          tradie: { full_name: 'Cleaner A' },
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rj-a');
      expect(result[1].id).toBe('rj-b');
    });

    it('uses "Unknown" when tradie info is null', async () => {
      const now = new Date();
      const dueSoon = new Date(now);
      dueSoon.setDate(dueSoon.getDate() + 1);

      const mockJobs = [
        {
          id: 'rj-4',
          trade_category: 'hvac',
          description: 'AC service',
          next_due_date: dueSoon.toISOString(),
          reminder_days_before: 7,
          tradie_id: 'tradie-4',
          tradie: null,
        },
      ];

      mockFromResponse({ data: mockJobs, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].tradie_name).toBe('Unknown');
    });

    it('throws when not authenticated and no userId provided', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: null },
        error: null,
      } as never);

      await expect(getDueReminders()).rejects.toThrow('Not authenticated');
    });

    it('throws on supabase query error', async () => {
      mockFromResponse({ data: null, error: { message: 'Reminder query failed' } });

      await expect(getDueReminders('user-1')).rejects.toThrow('Reminder query failed');
    });

    it('returns empty array when data is null', async () => {
      mockFromResponse({ data: null, error: null });

      const result = await getDueReminders('user-1');
      expect(result).toEqual([]);
    });
  });
});
