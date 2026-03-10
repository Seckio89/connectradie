import { renderHook, act } from '@testing-library/react';
import { useToast } from '../useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with toast hidden', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast.show).toBe(false);
    expect(result.current.toast.message).toBe('');
  });

  it('shows toast with message', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Hello!');
    });

    expect(result.current.toast.show).toBe(true);
    expect(result.current.toast.message).toBe('Hello!');
    expect(result.current.toast.isError).toBe(false);
  });

  it('shows error toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Something went wrong', true);
    });

    expect(result.current.toast.show).toBe(true);
    expect(result.current.toast.isError).toBe(true);
  });

  it('auto-hides after default duration (3000ms)', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Temporary');
    });

    expect(result.current.toast.show).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.toast.show).toBe(false);
    expect(result.current.toast.message).toBe('');
  });

  it('auto-hides after custom duration', () => {
    const { result } = renderHook(() => useToast(1000));

    act(() => {
      result.current.showToast('Quick');
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.toast.show).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast.show).toBe(false);
  });

  it('hideToast cancels timer and hides immediately', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Will hide');
    });

    act(() => {
      result.current.hideToast();
    });

    expect(result.current.toast.show).toBe(false);
  });

  it('showing a new toast resets the timer', () => {
    const { result } = renderHook(() => useToast(3000));

    act(() => {
      result.current.showToast('First');
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Show second toast — timer should reset
    act(() => {
      result.current.showToast('Second');
    });

    expect(result.current.toast.message).toBe('Second');

    // After 2000ms more, first timer would have expired but second shouldn't
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.toast.show).toBe(true);

    // After full 3000ms from second toast, it should hide
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toast.show).toBe(false);
  });

  it('cleans up timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Before unmount');
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
