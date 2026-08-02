import { renderHook, waitFor } from '@testing-library/react';
import { useTradeCategories } from '../useTradeCategories';

// useTradeCategories keeps a module-level cache and a module-level in-flight
// promise, so the first fetch of the module's life decides what every later
// consumer sees. That makes the tests order-dependent by design: this file
// exercises the successful fetch and the cache that follows it. The failed
// fetch needs a fresh module registry and lives in
// useTradeCategories.fetchFailure.test.ts.

const { orderMock, fromMock, selectMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const selectMock = vi.fn(() => ({ order: orderMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { orderMock, fromMock, selectMock };
});

vi.mock('../../lib/supabase', () => ({ supabase: { from: fromMock } }));

describe('useTradeCategories', () => {
  it('serves the fallback list while the fetch is in flight, then the DB list', async () => {
    orderMock.mockResolvedValue({
      data: [
        { id: '1', name: 'Air Conditioning' },
        { id: '2', name: 'Plumber' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTradeCategories());

    // Nothing awaited yet: the hook must still hand back a usable list rather
    // than an empty select.
    expect(result.current.loading).toBe(true);
    expect(result.current.categories[0]).toEqual({ value: '', label: 'All Trades' });
    expect(result.current.categories.map((c) => c.value)).toContain('plumber');

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categories).toEqual([
      { value: '', label: 'All Trades' },
      // Multi-word names are slugified for the query-string value.
      { value: 'air-conditioning', label: 'Air Conditioning' },
      { value: 'plumber', label: 'Plumber' },
    ]);
  });

  it('queries trade_categories ordered by name', () => {
    expect(fromMock).toHaveBeenCalledWith('trade_categories');
    expect(selectMock).toHaveBeenCalledWith('id, name');
    expect(orderMock).toHaveBeenCalledWith('name', { ascending: true });
  });

  it('reuses the cached list for later consumers without refetching', async () => {
    fromMock.mockClear();

    const { result } = renderHook(() => useTradeCategories());

    // Cache hit: no loading flash on the second component to ask.
    expect(result.current.loading).toBe(false);
    expect(result.current.categories.map((c) => c.label)).toEqual([
      'All Trades',
      'Air Conditioning',
      'Plumber',
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromMock).not.toHaveBeenCalled();
  });
});
