'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
  /** What failed, in the user's terms: "The engine panel", "The explorer". */
  readonly label: string;
  readonly onReset?: () => void;
}

interface State {
  readonly error: Error | null;
}

/**
 * Keeps one panel's failure from taking the workspace with it.
 *
 * A crash in the explorer must not lose an analysis session that exists only in
 * memory. The board and the move tree are what matter; everything around them
 * is wrapped so that it can fail alone and be retried.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}] ${error.message}`, info.componentStack);
  }

  private readonly retry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <p className="text-xs font-medium text-negative">{this.props.label} stopped working.</p>
        <p className="max-w-[40ch] font-mono text-2xs leading-relaxed text-tertiary">
          {error.message}
        </p>
        <p className="max-w-[40ch] text-2xs leading-relaxed text-tertiary">
          Your analysis is unaffected. Retrying is safe.
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-1 rounded-[4px] border border-line bg-surface-2 px-2.5 py-1 text-2xs text-primary transition-colors hover:bg-surface-3"
        >
          Try again
        </button>
      </div>
    );
  }
}
