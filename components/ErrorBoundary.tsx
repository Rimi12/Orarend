import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Megfogott hiba az ErrorBoundary-ban:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('timetableAppStateV1');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-lg w-full text-center border border-red-200 dark:border-red-800">
            <span className="text-5xl mb-4 inline-block">⚠️</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Váratlan hiba történt a megjelenítés során
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Az alkalmazás biztonsági okokból leállította a hibás felület betöltését.
            </p>
            {this.state.error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-mono text-left rounded-lg overflow-x-auto max-h-32 mb-6 border border-red-200 dark:border-red-900">
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-xs"
              >
                🔄 Oldal újratöltése
              </button>
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold text-sm rounded-xl transition-colors"
              >
                🧹 Alaphelyzetbe állítás
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
