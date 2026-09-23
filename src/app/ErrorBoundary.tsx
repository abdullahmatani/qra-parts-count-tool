import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary so an unexpected rendering error shows a message instead
 * of a blank page. Nothing is reported anywhere (no telemetry, FDS section 2);
 * the error is only written to the local console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled rendering error', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-lg border bg-background p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{i18n.t('errors.crashTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{i18n.t('errors.crashBody')}</p>
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
            {error.message}
          </pre>
          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            {i18n.t('common.reload')}
          </button>
        </div>
      </div>
    );
  }
}
