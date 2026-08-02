import { act, renderHook } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  setNavigatorOnline(true);
});

describe('useOnlineStatus', () => {
  it('starts from navigator.onLine', () => {
    setNavigatorOnline(true);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(true);

    setNavigatorOnline(false);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(false);
  });

  it('goes false when the browser fires offline', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('goes true again when the browser fires online', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('tracks repeated transitions', () => {
    const { result } = renderHook(() => useOnlineStatus());

    for (const [event, expected] of [
      ['offline', false],
      ['online', true],
      ['offline', false],
    ] as const) {
      act(() => {
        window.dispatchEvent(new Event(event));
      });
      expect(result.current).toBe(expected);
    }
  });

  it('stops listening after unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useOnlineStatus());

    unmount();

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toContain('online');
    expect(removed).toContain('offline');

    // A late event must not touch the unmounted hook's state.
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(true);

    removeSpy.mockRestore();
  });
});
