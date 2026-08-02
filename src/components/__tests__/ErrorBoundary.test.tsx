import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Sentry from '@sentry/react';
import ErrorBoundary from '../ErrorBoundary';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

const CHUNK_RELOAD_KEY = 'connectradie_chunk_reload_attempted';

function Boom({ error }: { error: Error }): never {
  throw error;
}

const reload = vi.fn();
let realLocation: Location;

// React re-dispatches a caught error as a window "error" event so browser
// devtools still show it. jsdom then prints the whole stack to the test
// report. Expected noise — swallow it.
const swallowExpectedError = (event: ErrorEvent) => event.preventDefault();

beforeAll(() => {
  window.addEventListener('error', swallowExpectedError);
  realLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload, assign: vi.fn(), replace: vi.fn() },
  });
});

afterAll(() => {
  window.removeEventListener('error', swallowExpectedError);
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

beforeEach(() => {
  vi.clearAllMocks();
  // afterEach restores mocks, which strips the factory's implementation off
  // the Sentry doubles — put flush's promise back before each test.
  vi.mocked(Sentry.flush).mockResolvedValue(true);
  sessionStorage.clear();
  // React logs the caught error to console.error on purpose. That noise is
  // expected here, so it is swallowed rather than left to drown the report.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Dashboard content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('catches a throwing child and renders the fallback screen', () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error('render exploded')} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'This page hit an error' })).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('offers a reload affordance that reloads the page', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Boom error={new Error('render exploded')} />
      </ErrorBoundary>,
    );

    const button = screen.getByRole('button', { name: /Reload page/ });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clears the chunk-reload guard when the user reloads manually', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');

    render(
      <ErrorBoundary>
        <Boom error={new Error('render exploded')} />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: /Reload page/ }));

    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('reports the error to Sentry with the component stack', () => {
    const error = new Error('render exploded');

    render(
      <ErrorBoundary>
        <Boom error={error} />
      </ErrorBoundary>,
    );

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [reported, context] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(reported).toBe(error);
    expect((context as { extra: { componentStack: string } }).extra.componentStack).toContain('Boom');
  });

  it('does not auto-reload for an ordinary render error', () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error('render exploded')} />
      </ErrorBoundary>,
    );

    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    expect(Sentry.flush).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('auto-recovers once from a stale-bundle chunk load error', async () => {
    const chunkError = new Error('Failed to fetch dynamically imported module: /assets/Jobs-a1b2.js');

    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );

    // The guard is set synchronously; the reload waits on the Sentry flush.
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    expect(Sentry.flush).toHaveBeenCalledWith(2000);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('recognises a ChunkLoadError by name as well as message', () => {
    const chunkError = new Error('boom');
    chunkError.name = 'ChunkLoadError';

    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );

    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });

  it('does not loop: a second chunk error in the same tab shows the manual screen', () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    const chunkError = new Error('Loading chunk 42 failed');

    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );

    expect(Sentry.flush).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'This page hit an error' })).toBeInTheDocument();
  });
});
