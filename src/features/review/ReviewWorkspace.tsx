'use client';

/**
 * The improvement workstation.
 *
 * Three columns, and the middle one is still the board. Left: what is waiting
 * to be reviewed, and what the history adds up to. Middle: the position and
 * the moves. Right: the journal, and — only once the player has chosen to look
 * — the same tool dock every other route has, with the engine, the explorer,
 * the tablebase and the rest in it.
 *
 * The reveal gate is the whole design. Evidence is *withheld*, not missing:
 * the dock keeps its tabs, says whose decision the silence was, and offers one
 * button. Withholding by not mounting is also what makes it real — a locked
 * tool issues no query and starts no engine, so nothing leaks a number into
 * the corner of the screen while the player is still thinking.
 *
 * Turning self-analysis off makes this route behave like Analysis with a
 * journal attached, which is the right thing for reviewing a game you have
 * already seen the engine on.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { Segmented, Tabs } from '@/components/ui/Tabs';
import { positionKey } from '@/chess/fen';
import { NavButton } from '@/features/shell/NavButton';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { MoveTreePanel } from '@/features/movetree/MoveTreePanel';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { invalidateReview } from '@/features/persistence/queries';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getRepositories } from '@/persistence/repositories';
import type { DecisionRecord, ReviewItemRecord } from '@/persistence/domain';
import { createTree } from '@/chess/tree/tree';
import { JournalAnalytics } from './JournalAnalytics';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { CriticalInbox } from './CriticalInbox';
import { DecisionJournal } from './DecisionJournal';
import { ImprovementSummary } from './ImprovementSummary';
import { SuggestCandidatesButton } from './SuggestCandidates';
import { useDecisionAt, useReviewItems } from './queries';
import { useReviewSession } from './review-session-store';

type LeftTab = 'queue' | 'improvement' | 'journal';

export function ReviewWorkspace() {
  const client = useQueryClient();
  const wide = useMediaQuery('(min-width: 1280px)');
  const { node, tree, currentId } = useAnalysisPosition();
  const document = useAnalysis((state) => state.document);
  const openDocument = useAnalysis((state) => state.openDocument);
  const notify = useUi((state) => state.notify);

  const selfAnalysis = useReviewSession((state) => state.selfAnalysis);
  const setSelfAnalysis = useReviewSession((state) => state.setSelfAnalysis);
  const revealedKeys = useReviewSession((state) => state.revealed);
  const reveal = useReviewSession((state) => state.reveal);
  const resetAnswers = useReviewSession((state) => state.resetAnswers);

  const [tab, setTab] = useState<LeftTab>('queue');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const key = positionKey(node.fen);
  const revealed = !selfAnalysis || revealedKeys.includes(key);
  const decision = useDecisionAt(key);
  const reviewItems = useReviewItems();

  /*
    Moving to another position abandons the draft answers. They belong to the
    position they were written about, and carrying half a candidate list to the
    next move would silently attach it to the wrong one.
  */
  useEffect(() => {
    resetAnswers();
  }, [key, resetAnswers]);

  const openItem = useCallback(
    async (item: ReviewItemRecord) => {
      setSelectedItemId(item.id);
      if (!item.gameId) {
        notify({
          tone: 'info',
          message: 'That position was not saved from a stored game.',
          detail: 'Open it from wherever you recorded it, or review it here from its FEN.',
        });
        return;
      }
      const repositories = await getRepositories();
      const game = await repositories.games.get(item.gameId);
      if (!game) {
        notify({ tone: 'error', message: 'That game is no longer in your database.' });
        return;
      }
      openDocument({
        tree: game.tree,
        document: {
          kind: 'database-game',
          title: item.gameLabel ?? 'Game',
          gameId: game.id,
        },
        ...(item.nodeId && game.tree.nodes[item.nodeId] ? { currentId: item.nodeId } : {}),
      });
    },
    [notify, openDocument],
  );

  /**
   * Put a recorded decision back on the board.
   *
   * A statistic that cannot be opened is decoration, so every drill-down in
   * the journal analytics ends here — at the position the number was about,
   * with the record already written for it.
   */
  const openDecision = useCallback(
    async (record: DecisionRecord) => {
      if (record.gameId) {
        const repositories = await getRepositories();
        const game = await repositories.games.get(record.gameId);
        if (game) {
          openDocument({
            tree: game.tree,
            document: { kind: 'database-game', title: 'Game', gameId: game.id },
            ...(record.nodeId && game.tree.nodes[record.nodeId]
              ? { currentId: record.nodeId }
              : {}),
          });
          return;
        }
      }
      // A decision recorded in calculation mode has no game behind it. Its FEN
      // is still a position, and opening that is better than refusing.
      openDocument({
        tree: createTree(record.fen, { Event: 'Recorded decision', Result: '*' }),
        document: { kind: 'untitled', title: 'Recorded decision' },
      });
    },
    [openDocument],
  );

  const markCritical = async () => {
    try {
      const repositories = await getRepositories();
      const item = await repositories.review.upsertReviewItem({
        positionKey: key,
        fen: node.fen,
        sideToMove: node.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        source: 'marked',
        nodeId: currentId,
        ply: node.ply,
        ...(document.kind === 'database-game'
          ? { gameId: document.gameId, gameLabel: document.title }
          : {}),
        ...(document.kind === 'study-chapter' ? { chapterId: document.chapterId } : {}),
      });
      setSelectedItemId(item.id);
      invalidateReview(client);
      notify({
        tone: 'success',
        message: 'Marked for review.',
        detail: `This position is now in your queue. The same canonical position reached from a different move order will map to the same work item.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be added.',
      });
    }
  };

  /* Phase 41: find the marked item for the current
     position so the header can switch between "Mark for
     review" and "Marked — open / remove". The identity key
     is canonical-position-only for marked items, so this
     lookup is exact regardless of which move order reached
     the position. */
  const markedItem = useMemo(() => {
    const items = reviewItems.data ?? [];
    return items.find((it) => it.source === 'marked' && it.positionKey === key) ?? null;
  }, [reviewItems.data, key]);

  const removeMark = async () => {
    if (!markedItem) return;
    try {
      const repositories = await getRepositories();
      await repositories.review.deleteReviewItem(markedItem.id);
      if (selectedItemId === markedItem.id) setSelectedItemId(null);
      invalidateReview(client);
      notify({ tone: 'info', message: 'Removed from your review queue.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The mark could not be removed.',
      });
    }
  };

  const context = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line-subtle px-2 py-1.5">
        <Tabs
          items={[
            { id: 'queue' as const, label: 'Queue' },
            { id: 'improvement' as const, label: 'Improvement' },
            /*
              Not "Journal": the tool dock's context panel is already called
              that, and it is the right name for it — the record for the
              position on the board. This tab is the journal in aggregate, and
              "Patterns" says what its three views actually show without
              claiming a score for any of them.
            */
            { id: 'journal' as const, label: 'Patterns' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="min-h-0 flex-1">
        <ErrorBoundary
          label={
            tab === 'queue'
              ? 'The review queue'
              : tab === 'journal'
                ? 'Journal analytics'
                : 'The improvement summary'
          }
        >
          {tab === 'queue' ? (
            <CriticalInbox selectedId={selectedItemId} onOpen={(item) => void openItem(item)} />
          ) : tab === 'journal' ? (
            <JournalAnalytics onOpenDecision={(decision) => void openDecision(decision)} />
          ) : (
            <ImprovementSummary onOpenItem={(item) => void openItem(item)} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="density-row flex h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <div className="min-w-0">
          <h1 className="truncate text-xs font-medium text-primary">Review</h1>
          <p className="truncate text-[10px] text-tertiary">
            {document.kind === 'untitled' ? 'Open one of your games to review it' : document.title}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[10px] text-tertiary sm:inline">Evidence</span>
          <Segmented
            items={[
              { id: 'hidden' as const, label: 'Hidden' },
              { id: 'visible' as const, label: 'Visible' },
            ]}
            value={selfAnalysis ? 'hidden' : 'visible'}
            onChange={(value) => setSelfAnalysis(value === 'hidden')}
          />
          {markedItem ? (
            <>
              <span
                className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] text-primary"
                title={
                  markedItem.markedFromGames.length > 1
                    ? `Marked from ${markedItem.markedFromGames.length} of your games`
                    : 'Marked for review'
                }
              >
                Marked for review
              </span>
              <Button
                variant="ghost"
                onClick={() => void openItem(markedItem)}
                aria-label="Open the marked position"
              >
                Open
              </Button>
              <Button
                variant="ghost"
                onClick={() => void removeMark()}
                aria-label="Remove the mark"
              >
                Remove mark
              </Button>
            </>
          ) : (
            <Button onClick={() => void markCritical()}>Mark for review</Button>
          )}
          <SuggestCandidatesButton />
          {selfAnalysis && !revealed ? (
            <Button variant="accent" onClick={() => reveal(key)}>
              Reveal
            </Button>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto',
          wide && 'grid grid-cols-[300px_minmax(0,1fr)_360px] overflow-hidden',
        )}
      >
        <aside
          className={cn(
            'min-h-0 min-w-0 bg-surface-1',
            wide
              ? 'border-r border-line-subtle'
              : 'order-3 min-h-[420px] border-t border-line-subtle',
          )}
        >
          {context}
        </aside>

        <section className="flex min-h-[620px] min-w-0 flex-col wide:min-h-0">
          {document.kind === 'untitled' && tree.nodes[tree.rootId]?.children.length === 0 ? (
            <div className="flex min-h-[420px] flex-1 items-center justify-center px-4">
              <EmptyState
                title="Nothing open to review."
                description="Open one of your own games from Games, or pick a position from the queue. Review keeps the engine hidden until you have written down what you think."
              />
            </div>
          ) : (
            <>
              <CanonicalBoardSurface
                mode="interactive"
                showEvaluationArtifacts
                /*
                  One flag, resolved by the capability contract, rather than
                  this route remembering which artefacts leak. The bar is a
                  number and a number in the corner of the board is the leak
                  this workflow exists to prevent — but so is a stored `!` on
                  the next move, which `showEvaluationArtifacts` never covered.
                */
                conceal={!revealed}
                className="min-h-[460px] flex-1 px-3 py-3 sm:px-4"
              />
            </>
          )}
          <WorkspaceLowerPanel
            workspace="review"
            contextLabel="Journal"
            withMoveTree
            moveTreePanel={<MoveTreePanel withHeader={false} />}
          />
        </section>

        <WorkspaceToolDock
          withMoveTree
          moveTreePanel={<MoveTreePanel withHeader={false} />}
          workspace="review"
          fill={wide}
          contextLabel="Journal"
          contextPanel={
            <DecisionJournal
              decision={decision.data ?? null}
              reviewItem={
                (reviewItems.data ?? []).find((item) => item.id === selectedItemId) ?? null
              }
              onSaved={() => void decision.refetch()}
            />
          }
          locked={
            revealed
              ? undefined
              : {
                  message:
                    'Computer evidence is hidden while you record your own reading of this position. Nothing here is running.',
                  action: (
                    <Button variant="accent" onClick={() => reveal(key)}>
                      Reveal analysis
                    </Button>
                  ),
                }
          }
        />
      </div>
    </div>
  );
}
