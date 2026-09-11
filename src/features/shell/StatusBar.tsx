'use client';

import { useState } from 'react';

import { nodeCount } from '@/chess/tree/tree';
import { cn } from '@/lib/cn';
import { documentTitle } from '@/persistence/describe';
import { selectFen, selectSaveState, useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';

import { BackgroundActivityCentre } from './BackgroundActivityCentre';

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
  const [showFen, setShowFen] = useState(false);

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setShowFen(true);
      notify({
        tone: 'error',
        message: 'Could not copy FEN',
        detail:
          'The clipboard is not available in this context; the FEN is shown next to the button.',
      });
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
        "What am I editing, and is it safe?" — answered on every route and at
        every width.

        This used to be `md:hidden`, on the reasoning that the toolbar's
        document header covered desktop. That header only renders in Analysis,
        so on a desktop Studies, Repertoire or Preparation screen there was no
        save indicator anywhere: a user editing a chapter for an hour had no
        way at all to tell whether it was written. A local-first application
        must always be able to answer that, so it is always here — quietly, and
        accepting a small duplication in Analysis.
      */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
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

      {/*
        Renders nothing at all when nothing is running, which is most of the
        time. A status area that is permanently occupied is one people stop
        reading, and this exists to be noticed. §31.
      */}
      <BackgroundActivityCentre />

      {/*
        The status bar used to render the full FEN string as a permanent piece
        of footer text. That made a position that already has plenty of chrome
        — move list, evaluation, engine line — feel busier than a player needs.
        The FEN is still one click away: a compact button copies the canonical
        current-position FEN, and the full string is shown on hover or on
        clipboard failure for the user who actually needs to read it.
      */}
      <div className="relative ml-auto hidden items-center md:flex">
        <button
          type="button"
          onClick={copyFen}
          onMouseEnter={() => setShowFen(true)}
          onMouseLeave={() => setShowFen(false)}
          onFocus={() => setShowFen(true)}
          onBlur={() => setShowFen(false)}
          aria-label="Copy current position as FEN"
          aria-live="polite"
          data-copy-fen
          className={cn(
            'inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 transition-colors',
            'text-tertiary hover:bg-surface-2 hover:text-secondary',
            copied && 'text-positive',
          )}
        >
          <CopyIcon className="h-3 w-3" />
          <span>{copied ? 'Copied' : 'Copy FEN'}</span>
        </button>
        {/*
          The tooltip is a real element rather than a `title` attribute so it
          can be styled and so the value it carries can be selected and
          re-copied by the user. It is also the fallback surface when the
          clipboard is denied (PART BB).
        */}
        <span
          data-fen-tooltip
          aria-hidden={!showFen && !copied}
          className={cn(
            'pointer-events-none absolute bottom-full right-0 z-30 mb-1 max-w-[60ch] truncate rounded-[3px] border border-line bg-surface-3 px-1.5 py-1 font-mono text-[10px] text-secondary shadow-md transition-opacity',
            showFen || copied ? 'opacity-100' : 'opacity-0',
          )}
        >
          {fen}
        </span>
      </div>
    </footer>
  );
}

function CopyIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <path d="M2 8V3a1 1 0 0 1 1-1h5" />
    </svg>
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
