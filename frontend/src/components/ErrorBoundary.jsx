import { Component } from 'react';

/**
 * Top-level error boundary.
 *
 * React unmounts the entire tree when a render throws and, with no boundary
 * anywhere in the app, that presents as a blank white page with no message and
 * no way back. That is not a cosmetic problem: it hides the actual error, it
 * strands the user on a dead URL, and it makes every unrelated bug look like
 * "the app is just broken".
 *
 * The payment flow hit exactly this. A gateway redirect landed on /wallet, the
 * status poll silently gave up, and the user's only feedback was a white
 * screen - so the real fault (a mismatched query param) was invisible.
 *
 * This must stay a class component: getDerivedStateFromError and
 * componentDidCatch have no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Surfaced in the browser console so the stack is recoverable in
    // production, where there is no other way to see it.
    // eslint-disable-next-line no-console
    console.error('[error-boundary] render crashed:', error, info?.componentStack);
  }

  reset() {
    this.setState({ error: null, info: null });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">
              This page ran into a problem
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Something went wrong while rendering. Your data is safe — nothing was
              submitted or charged. You can try again, or head back to your dashboard.
            </p>

            <details className="mt-4 text-xs text-slate-500">
              <summary className="cursor-pointer select-none">Technical details</summary>
              <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                {String(error?.message || error)}
                {info?.componentStack || ''}
              </pre>
            </details>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/dashboard'; }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
              >
                Go to dashboard
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/wallet'; }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
              >
                Go to wallet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
