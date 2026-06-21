import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Emberbench encountered an unrecoverable interface error.', error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="fatal-error">
        <p className="kicker">EMBERBENCH RECOVERY</p>
        <h1>The interface lost its footing.</h1>
        <p>
          Your downloaded models and browser data are still intact. Reload the application to
          restore the interface.
        </p>
        <button
          className="button button--primary"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload Emberbench
        </button>
        <details>
          <summary>Technical detail</summary>
          <code>{this.state.error.message}</code>
        </details>
      </main>
    );
  }
}
