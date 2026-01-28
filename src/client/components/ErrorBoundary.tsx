import { Component, type ReactNode, type ErrorInfo } from 'react';
import '../styles/components.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-message">
            <div className="error-message__icon">⚠</div>
            <div className="error-message__content">
              <h3 className="error-message__title">Something went wrong</h3>
              <p className="error-message__text">
                {this.state.error?.message ?? 'An unexpected error occurred'}
              </p>
              {this.state.errorInfo && (
                <details style={{ marginTop: '8px', fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                    Error Details
                  </summary>
                  <pre
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-family-mono)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              <button className="error-message__retry" onClick={this.handleReset}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
