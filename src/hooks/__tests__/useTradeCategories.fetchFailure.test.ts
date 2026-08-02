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

  it('retries on the next mount once the DB is reachable again', async () => {
    // Regression: loadCategories() only populates `cachedCategories` on
    // success, but `fetchPromise` used to be assigned regardless and never
    // cleared — so the `if (!fetchPromise)` guard blocked every later fetch.
    // One failed load pinned the whole session to the hard-coded fallback
    // list, and a tradie whose category had just been added to the DB stayed
    // unselectable until the tab was reloaded. The settled promise is now
    // dropped when it did not cache, so the next mount tries again.
    fromMock.mockClear();
    orderMock.mockResolvedValue({
      data: [{ id: '1', name: 'Solar Installer' }],
      error: null,
    });

    const { result } = renderHook(() => useTradeCategories());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.categories.map((c) => c.label)).toContain('Solar Installer'),
    );
  });

  it('caches the successful result, so a third mount does not re-fetch', async () => {
    // The retry must not become a fetch on every mount — that would hammer the
    // DB from every component that reads the category list.
    fromMock.mockClear();

    const { result } = renderHook(() => useTradeCategories());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.categories.map((c) => c.label)).toContain('Solar Installer');
  });
});
