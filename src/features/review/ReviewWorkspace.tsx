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

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelHeader } from '@/components/ui/Panel';
import { Segmented, Tabs } from '@/components/ui/Tabs';
import { positionKey } from '@/chess/fen';
import { MoveTree } from '@/features/movetree/MoveTree';
import { NavButton } from '@/features/shell/NavButton';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { invalidateReview } from '@/features/persistence/queries';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewItemRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { CriticalInbox } from './CriticalInbox';
import { DecisionJournal } from './DecisionJournal';
import { ImprovementSummary } from './ImprovementSummary';
import { SuggestCandidatesButton } from './SuggestCandidates';
import { useDecisionAt, useReviewItems } from './queries';
import { useReviewSession } from './review-session-store';

type LeftTab = 'queue' | 'improvement';

export function ReviewWorkspace() {
  const client = useQueryClient();
  const wide = useMediaQuery('(min-width: 1280px)');
  const { node, tree, currentId } = useAnalysisPosition();
  const document = useAnalysis((state) => state.document);
  const goTo = useAnalysis((state) => state.goTo);
  const openDocument = useAnalysis((state) => state.openDocument);
  const setMoveMenu = useUi((state) => state.setMoveMenu);
  const setCommentingNodeId = useUi((state) => state.setCommentingNodeId);
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
      notify({ tone: 'success', message: 'Added to your review queue.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be added.',
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
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="min-h-0 flex-1">
        <ErrorBoundary label={tab === 'queue' ? 'The review queue' : 'The improvement summary'}>
          {tab === 'queue' ? (
            <CriticalInbox selectedId={selectedItemId} onOpen={(item) => void openItem(item)} />
          ) : (
            <ImprovementSummary onOpenItem={(item) => void openItem(item)} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
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
          <Button onClick={() => void markCritical()}>Add to queue</Button>
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
                /*
                  No evaluation bar and no engine arrows while evidence is
                  hidden: the bar is a number, and a number in the corner of the
                  board is exactly the leak this workflow exists to prevent.
                */
                showEvaluationArtifacts={revealed}
                className="min-h-[460px] flex-1 px-3 py-3 sm:px-4"
              />
              <Panel className="h-[200px] shrink-0 border-t border-line-subtle">
                <PanelHeader>Moves</PanelHeader>
                <div className="min-h-0 flex-1">
                  <ErrorBoundary label="The move list">
                    <MoveTree
                      tree={tree}
                      currentId={currentId}
                      onSelect={goTo}
                      onContextMenu={(nodeId, event) =>
                        setMoveMenu({ nodeId, x: event.clientX, y: event.clientY })
                      }
                      onEditComment={setCommentingNodeId}
                    />
                  </ErrorBoundary>
                </div>
              </Panel>
            </>
          )}
        </section>

        <WorkspaceToolDock
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
