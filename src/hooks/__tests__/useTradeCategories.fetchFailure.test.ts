import { renderHook, waitFor } from '@testing-library/react';
import { useTradeCategories } from '../useTradeCategories';

// Separate file so this gets its own module registry — useTradeCategories
// caches the in-flight fetch at module scope, and the happy path in
// useTradeCategories.test.ts would otherwise have consumed it.

const { orderMock, fromMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const fromMock = vi.fn(() => ({ select: vi.fn(() => ({ order: orderMock })) }));
  return { orderMock, fromMock };
});

vi.mock('../../lib/supabase', () => ({ supabase: { from: fromMock } }));

describe('useTradeCategories when the fetch fails', () => {
  it('falls back to the built-in trade list', async () => {
    orderMock.mockResolvedValue({ data: null, error: { message: 'network down' } });

    const { result } = renderHook(() => useTradeCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories[0]).toEqual({ value: '', label: 'All Trades' });
    expect(result.current.categories.map((c) => c.value)).toEqual([
      '',
      'plumber',
      'electrician',
      'carpenter',
      'builder',
      'painter',
      'landscaper',
      'handyman',
      'cleaner',
      'roofer',
      'tiler',
    ]);
  });

  it('never retries after a failed fetch, even once the DB is reachable again', async () => {
    // BUG (reported, not fixed): loadCategories() only populates
    // `cachedCategories` on success, but `fetchPromise` is assigned regardless
    // and is never cleared. The `if (!fetchPromise)` guard therefore blocks
    // every later fetch, so one failed load pins the whole session to the
    // hard-coded fallback list — a tradie whose category was added to the DB
    // stays unselectable until the tab is reloaded. Asserted against current
    // behaviour.
    fromMock.mockClear();
    orderMock.mockResolvedValue({
      data: [{ id: '1', name: 'Solar Installer' }],
      error: null,
    });

    const { result } = renderHook(() => useTradeCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.categories.map((c) => c.label)).not.toContain('Solar Installer');
    expect(result.current.categories.map((c) => c.label)).toContain('Plumber');
  });
});
