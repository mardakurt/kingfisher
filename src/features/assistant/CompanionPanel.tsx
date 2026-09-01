'use client';

/**
 * The grounded companion.
 *
 * It answers from an evidence packet the application built, and the packet is
 * shown underneath the answer so every claim can be checked against what was
 * actually supplied. That disclosure is not a nicety — it is the difference
 * between an assistant and a chess-flavoured text generator, and it is why the
 * panel is worth having at all.
 */

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { formatScore } from '@/chess/evaluation';
import { positionFeatures } from '@/chess/features';
import { parseFen, positionKey } from '@/chess/fen';
import { mustGetNode, nodePath } from '@/chess/tree/tree';
import type { San } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useExplorer } from '@/features/explorer/useExplorer';
import { useRepertoiresAtPosition, useRepertoires } from '@/features/persistence/queries';
import { buildEvidencePacket, renderPacket } from '@/assistant/evidence';
import { createAssistantProvider, AssistantError, type AssistantMode } from '@/assistant/provider';
import { MODE_LABELS, systemPrompt, userPrompt } from '@/assistant/prompt';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

const MODES: readonly AssistantMode[] = [
  'explain',
  'plan',
  'calculate',
  'compare',
  'opening-prep',
  'review',
];

export function CompanionPanel() {
  const { node, position, currentId } = useAnalysisPosition();
  const tree = useAnalysis((state) => state.tree);
  const prefs = usePreferences();
  const primary = useEngine((state) => state.primary);
  const secondary = useEngine((state) => state.secondary);

  const [mode, setMode] = useState<AssistantMode>('explain');
  const [question, setQuestion] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);

  const explorer = useExplorer(prefs.explorerSourceId, node.fen, {});
  const repertoireHere = useRepertoiresAtPosition(positionKey(node.fen));
  const repertoires = useRepertoires();

  const provider = useMemo(
    () =>
      createAssistantProvider({
        baseUrl: prefs.assistantBaseUrl,
        model: prefs.assistantModel,
        apiKey: prefs.assistantApiKey,
      }),
    [prefs.assistantApiKey, prefs.assistantBaseUrl, prefs.assistantModel],
  );

  const packet = useMemo(() => {
    const parsed = parseFen(node.fen);
    const record = repertoireHere.data?.[0] ?? null;
    const owner = record
      ? repertoires.data?.find((entry) => entry.id === record.repertoireId)
      : undefined;

    const line = nodePath(tree, currentId)
      .slice(1)
      .map((id) => mustGetNode(tree, id).move?.san)
      .filter((san): san is San => Boolean(san));

    return buildEvidencePacket({
      fen: node.fen,
      sideToMove: position.turn,
      line,
      // Only engines that analysed *this* position contribute. A stale reading
      // from the previous move would be evidence about a different board.
      engines: [
        ...(primary.analysedFen === node.fen
          ? [{ name: primary.identity?.name ?? 'Engine', analysis: primary.analysis }]
          : []),
        ...(secondary.analysedFen === node.fen
          ? [{ name: secondary.identity?.name ?? 'Second engine', analysis: secondary.analysis }]
          : []),
      ],
      ...(explorer.data
        ? {
            databaseName: explorer.data.source.name,
            databaseTotal: explorer.data.totalGames,
            databaseMoves: explorer.data.moves,
          }
        : {}),
      ...(record && owner
        ? { repertoire: { title: owner.title, color: owner.color, record } }
        : {}),
      ...(parsed.ok ? { features: positionFeatures(parsed.value) } : {}),
      notes: node.comment ? [node.comment] : [],
      formatScore,
    });
  }, [
    currentId,
    explorer.data,
    node.comment,
    node.fen,
    position.turn,
    primary,
    repertoireHere.data,
    repertoires.data,
    secondary,
    tree,
  ]);

  const ask = useMutation({
    mutationFn: async () => {
      if (!provider) throw new AssistantError('No assistant endpoint is configured.');
      return provider.ask({
        system: systemPrompt(mode),
        user: userPrompt(packet, question),
      });
    },
  });

  if (!provider) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader>Companion</PanelHeader>
        <PanelBody>
          <EmptyState
            title="No assistant is configured."
            description="Point Kingfisher at an OpenAI-compatible endpoint in Settings → Assistant — a hosted API or a local runner. Everything else works without one."
          />
        </PanelBody>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        Companion
        <span className="normal-case tracking-normal">{prefs.assistantModel}</span>
      </PanelHeader>

      <div className="shrink-0 border-b border-line-subtle px-2.5 py-2">
        <Segmented
          className="max-w-full"
          items={MODES.map((id) => ({ id, label: MODE_LABELS[id] }))}
          value={mode}
          onChange={setMode}
        />
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !ask.isPending) ask.mutate();
            }}
            placeholder="Ask about this position…"
            className="h-7 min-w-0 flex-1 rounded-[3px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
          />
          <Button variant="accent" onClick={() => ask.mutate()} disabled={ask.isPending}>
            {ask.isPending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-tertiary">
          Grounded in {packet.present.length === 0 ? 'nothing yet' : packet.present.join(', ')}.
        </p>
      </div>

      <PanelBody>
        {ask.isError ? (
          <EmptyState
            title="The assistant could not answer."
            description={
              ask.error instanceof AssistantError
                ? `${ask.error.message}${ask.error.remedy ? ` ${ask.error.remedy}` : ''}`
                : ask.error instanceof Error
                  ? ask.error.message
                  : 'Unknown failure.'
            }
          />
        ) : ask.data ? (
          <section className="px-3 py-3">
            <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap text-secondary">
              {ask.data}
            </p>
          </section>
        ) : (
          <EmptyState
            title="Ask a question."
            description="The answer is built only from the evidence below — engine lines, database counts, your repertoire, the structure. Nothing is recalled from training."
          />
        )}

        <section className="border-t border-line-subtle">
          <button
            type="button"
            onClick={() => setShowEvidence((open) => !open)}
            className="flex w-full items-center px-3 py-2 text-left text-[10px] uppercase tracking-wide text-tertiary hover:text-secondary"
          >
            Evidence supplied
            <span className="ml-auto">{showEvidence ? '−' : '+'}</span>
          </button>
          {showEvidence ? (
            <pre
              className={cn(
                'max-h-72 overflow-auto border-t border-line-subtle bg-surface-inset px-3 py-2',
                'font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-tertiary',
              )}
            >
              {renderPacket(packet)}
            </pre>
          ) : null}
        </section>
      </PanelBody>
    </div>
  );
}
