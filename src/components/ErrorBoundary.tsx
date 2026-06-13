import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// SessionStorage key that records that we've already tried one auto-reload
// for the current tab. Prevents an infinite reload loop if the chunk is
// genuinely broken (e.g. a real build issue rather than a stale cache).
const CHUNK_RELOAD_KEY = 'connectradie_chunk_reload_attempted';

// React.lazy throws a ChunkLoadError when the bundle it tries to import has
// been replaced on the server (typical after a deploy — the old HTML still
// references the old hashed filename, which no longer exists). The error
// surfaces under several different shapes depending on the bundler and the
// browser, so we sniff all of them.
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const name = error.name || '';
  const message = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    // Stale-bundle recovery: if this is a chunk-load error and we haven't
    // already tried, force one hard reload. Fresh HTML brings fresh chunk
    // references, which usually fixes it. If the same error fires again
    // post-reload, the gate stops us from looping and we fall through to
    // the regular error screen.
    if (isChunkLoadError(error)) {
      try {
        const alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY);
        if (!alreadyTried) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          // Flush Sentry before reloading. captureException is fire-and-
          // forget; reload() races past the in-flight POST and the error
          // never lands in monitoring. flush(2000) drains the queue with
          // a 2s deadline, then we reload regardless. .finally so a Sentry
          // outage can't block recovery.
          Sentry.flush(2000)
            .catch(() => undefined)
            .finally(() => {
              window.location.reload();
            });
        }
      } catch {
        // sessionStorage may be unavailable (strict private browsing). Fall
        // through to the manual reload screen rather than risk a loop.
      }
    }
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-8">
              An unexpected error occurred. Please try reloading the page.
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
