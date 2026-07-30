import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
}

export default class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Section error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-ct-md border border-ct-rose/[0.34] bg-ct-rose/[0.13] p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-ct-rose mx-auto mb-2" />
          <p className="text-sm font-medium text-ct-paper mb-3">
            {this.props.fallbackTitle || 'This section failed to load'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ct-rose bg-ct-surface border border-ct-rose/[0.34] rounded-ct-sm hover:bg-ct-rose/[0.13] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
