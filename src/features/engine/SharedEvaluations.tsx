'use client';

/**
 * Evaluations from files, in the engine panel (Phase 85): ChessBase's Let's
 * Check, as a file a person chooses to hand on (`src/evidence/exchange.ts`).
 *
 * At the position on the board, the evaluations received from other
 * Kingfishers, deepest first — each with its engine, depth and nodes, and
 * who exported it, from which file and when. Beside the local engine, never
 * mixed into it: nothing here writes to the tree, the bar or the arrows; a
 * line can be inserted as moves, like any variation the player keeps.
 *
 * Import reads a file the person chose; export saves this machine's own
 * evaluations (the analysis queue's and the saved deep analyses') as one.
 * Nothing is sent anywhere.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { formatScore } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Fen, San, Uci } from '@/chess/types';
import { Plus } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { variationTokens } from '@/engine/pv';
import {
  buildEvaluationsFile,
  evaluationsFileName,
  EvaluationsFileError,
  parseEvaluationsFile,
} from '@/evidence/exchange';
import { localEvaluations } from '@/evidence/local';
import { cn } from '@/lib/cn';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { scoreTone } from './score-chip';

const sanLine = (fen: string, pv: readonly Uci[]): San[] => {
  const out: San[] = [];
  let position = Position.fromTrustedFen(fen as Fen);
  for (const uci of pv) {
    const played = position.playUci(uci);
    if (!played.ok) break;
    out.push(played.value.san);
    position = Position.fromTrustedFen(played.value.after);
  }
  return out;
};

const nodesText = (nodes: number): string =>
  nodes >= 1e9
    ? `${(nodes / 1e9).toFixed(1)} billion nodes`
    : nodes >= 1e6
      ? `${Math.round(nodes / 1e6)} million nodes`
      : `${nodes.toLocaleString()} nodes`;

export function SharedEvaluationsSection({
  fen,
  ply,
}: {
  readonly fen: Fen;
  readonly ply: number;
}) {
  const key = positionKey(fen);
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const insertUciLine = useAnalysis((state) => state.insertUciLine);
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [name, setName] = useState('');

  const held = useQuery({
    queryKey: ['imported-evaluations', key],
    queryFn: async () => (await getRepositories()).importedEvaluations.atPosition(key),
  });
  const total = useQuery({
    queryKey: ['imported-evaluations', 'count'],
    queryFn: async () => (await getRepositories()).importedEvaluations.count(),
  });

  const importFile = async (file: File) => {
    try {
      let value: unknown;
      try {
        value = JSON.parse(await file.text());
      } catch {
        throw new EvaluationsFileError('This file is not JSON.');
      }
      const parsed = parseEvaluationsFile(value);
      const repositories = await getRepositories();
      const result = await repositories.importedEvaluations.importMany(parsed.evaluations, {
        file: file.name,
        from: parsed.from,
        exportedAt: parsed.exportedAt,
      });
      void queryClient.invalidateQueries({ queryKey: ['imported-evaluations'] });
      notify({
        tone: 'success',
        message: `${result.added.toLocaleString()} evaluation${result.added === 1 ? '' : 's'} added from ${file.name}${parsed.from ? `, exported by ${parsed.from}` : ''}.`,
        detail: [
          result.alreadyHeld ? `${result.alreadyHeld.toLocaleString()} were already here.` : '',
          parsed.refused
            ? `${parsed.refused.toLocaleString()} did not check and were left out.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The evaluations could not be read.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const exportMine = async () => {
    try {
      const repositories = await getRepositories();
      const file = buildEvaluationsFile(await localEvaluations(repositories), name || null);
      if (file.evaluations.length === 0) {
        notify({
          tone: 'info',
          message: 'There are no evaluations of your own to export yet.',
          detail:
            'Analyse a game with the queue, or run a deep analysis; their searches are what a file carries.',
        });
        return;
      }
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = evaluationsFileName(file.exportedAt);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExporting(false);
      notify({
        tone: 'success',
        message: `${file.evaluations.length.toLocaleString()} evaluation${file.evaluations.length === 1 ? '' : 's'} saved as ${anchor.download}.`,
        detail: 'Nothing was sent anywhere; hand the file to whoever should have it.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The evaluations could not be exported.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const rows = held.data ?? [];
  return (
    <section
      className="border-t border-line-subtle"
      aria-label="Evaluations from files"
      data-shared-evaluations={rows.length}
    >
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
        <h3 className="text-[11px] font-semibold text-secondary">From files</h3>
        <span className="text-[10.5px] text-tertiary tabular">
          {total.data ? `${total.data.toLocaleString()} held` : 'none received'}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          variant="subtle"
          onClick={() => input.current?.click()}
        >
          Import…
        </Button>
        <Button size="sm" variant="subtle" onClick={() => setExporting((value) => !value)}>
          Export mine…
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          data-shared-evaluations-input
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
      {exporting ? (
        <div className="flex items-center gap-2 px-2.5 pb-2" data-shared-evaluations-export>
          <input
            aria-label="Your name in the file (optional)"
            placeholder="Your name in the file (optional)"
            className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-surface-inset px-2 text-[11px] text-primary"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" variant="accent" onClick={() => void exportMine()}>
            Save file
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-2.5 pb-2 text-[11px] leading-snug text-tertiary">
          Evaluations another Kingfisher exported, opened here as a file, show at their positions.
          Nothing is sent or received on its own.
        </p>
      ) : (
        <ol className="divide-y divide-line-subtle">
          {rows.slice(0, 3).map((row) => (
            <li key={row.id} className="px-2.5 py-1.5" data-shared-evaluation>
              <div className="group flex items-baseline gap-2">
                <span
                  className={cn(
                    'w-[52px] shrink-0 rounded-[5px] px-1 py-0.5 text-center text-xs font-medium tabular',
                    scoreTone({ score: row.score }),
                  )}
                >
                  {formatScore(row.score)}
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-secondary [overflow-wrap:anywhere]">
                  {variationTokens(ply, sanLine(row.fen, row.pv)).map((token, index) => (
                    <span
                      key={index}
                      className={cn(
                        'mr-1',
                        token.isMove ? 'text-primary' : 'text-tertiary tabular',
                      )}
                    >
                      {token.text}
                    </span>
                  ))}
                </span>
                <IconButton
                  label="Insert this line into the game"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    const result = insertUciLine(row.pv);
                    if (!result.ok) {
                      notify({
                        tone: 'error',
                        message: 'That line no longer fits this position.',
                        detail: result.error.message,
                      });
                    }
                  }}
                >
                  <Plus />
                </IconButton>
              </div>
              <p className="mt-0.5 text-[10.5px] text-tertiary tabular" data-shared-provenance>
                {row.engine} · depth {row.depth} · {nodesText(row.nodes)} · from{' '}
                {row.source.from ?? 'an unnamed exporter'} ({row.source.file}), searched{' '}
                {new Date(row.analysedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
