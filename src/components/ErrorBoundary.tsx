import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0C1017] text-[#EEF2F6] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#121822] border border-red-800/70 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Command Session Interrupted</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
