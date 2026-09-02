'use client';

import { useState } from 'react';

import { nodeCount } from '@/chess/tree/tree';
import { cn } from '@/lib/cn';
import { documentTitle } from '@/persistence/describe';
import { selectFen, selectSaveState, useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';

const ENGINE_LABEL: Record<string, string> = {
  idle: 'Engine off',
  loading: 'Loading engine…',
  ready: 'Engine ready',
  analysing: 'Analysing',
  error: 'Engine error',
  unavailable: 'Engine unavailable',
};

export function StatusBar() {
  const fen = useAnalysis(selectFen);
  const moves = useAnalysis((state) => nodeCount(state.tree));
  const document = useAnalysis((state) => state.document);
  const saveState = useAnalysis(selectSaveState);
  const status = useEngine((state) => state.primary.status);
  const notify = useUi((state) => state.notify);
  const analysis = useEngine((state) => state.primary.analysis);
  const [copied, setCopied] = useState(false);

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Silently resetting the label made a denied clipboard look like a
      // click that did not register. Every other copy in the application
      // reports this; this one was the exception.
      setCopied(false);
      notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
    }
  };

  return (
    <footer className="flex h-6 min-w-0 shrink-0 items-center gap-3 overflow-hidden border-t border-line-subtle bg-surface-1 px-2.5 text-[10.5px] text-tertiary">
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'analysing' && 'bg-accent',
            status === 'ready' && 'bg-positive/70',
            (status === 'error' || status === 'unavailable') && 'bg-negative',
            (status === 'idle' || status === 'loading') && 'bg-line-strong',
          )}
        />
        {ENGINE_LABEL[status] ?? status}
      </span>

      {analysis && analysis.depth > 0 && (
        <span className="hidden tabular sm:inline">
          depth {analysis.depth}
          {analysis.seldepth ? `/${analysis.seldepth}` : ''} · {formatNodes(analysis.nodes)} nodes ·{' '}
          {formatNps(analysis.nps)}
        </span>
      )}

      {/* Dropped first on a phone: the move count is the least urgent thing here. */}
      <span className="hidden shrink-0 whitespace-nowrap tabular sm:inline">
        {moves} half-moves
      </span>

      {/*
        The toolbar's document header is hidden below `md`. On a phone this is
        the only place that answers "what am I editing, and is it safe?", and a
        local-first application must always be able to answer it.
      */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 md:hidden">
        <span className="min-w-0 truncate text-secondary">{documentTitle(document)}</span>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap',
            saveState === 'error'
              ? 'text-negative'
              : saveState === 'unsaved'
                ? 'text-caution'
                : 'text-tertiary',
          )}
        >
          {SAVE_LABEL[saveState]}
        </span>
      </span>

      <button
        type="button"
        onClick={copyFen}
        title="Copy FEN"
        className="ml-auto hidden max-w-[52ch] truncate font-mono text-[10.5px] text-tertiary transition-colors hover:text-secondary md:block"
      >
        {copied ? 'FEN copied' : fen}
      </button>
    </footer>
  );
}

const SAVE_LABEL: Record<string, string> = {
  saved: '· saved',
  saving: '· saving…',
  unsaved: '· unsaved',
  error: '· not saved',
};

const formatNodes = (nodes: number): string => {
  if (nodes >= 1e9) return `${(nodes / 1e9).toFixed(2)}B`;
  if (nodes >= 1e6) return `${(nodes / 1e6).toFixed(1)}M`;
  if (nodes >= 1e3) return `${(nodes / 1e3).toFixed(0)}k`;
  return String(nodes);
};

const formatNps = (nps: number): string =>
  nps >= 1e6 ? `${(nps / 1e6).toFixed(1)}M n/s` : `${Math.round(nps / 1000)}k n/s`;
