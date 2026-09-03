'use client';

/**
 * Working through a master game one decision at a time.
 *
 * The board is the game's own board — the panel drives the analysis cursor
 * rather than owning a second one — so everything else on screen (annotations,
 * repertoire links, structure) stays true to the position being guessed.
 *
 * The engine is not consulted and is not offered inside the flow. If the
 * player wants it after a guess, the dock is right there; putting a "what does
 * Stockfish say" button next to the answer would turn a question about a
 * player's reasoning into a question about an evaluation, which is the other
 * exercise.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { NodeId } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { AnswerBoard, type AcceptedMove } from '@/features/training/AnswerBoard';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { invalidateModelGames, useProfile } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import { positionKey } from '@/chess/fen';
import { stableId } from '@/persistence/ids';
import {
  KEY_MOMENT_KINDS,
  KEY_MOMENT_LABEL,
  type KeyMomentKind,
  type ModelGameKeyMoment,
} from '@/persistence/domain';
import { cn } from '@/lib/cn';

import {
  EMPTY_TALLY,
  guessColorFor,
  guessTargets,
  judgeGuess,
  recordGuess,
  type GuessResult,
} from './guess-the-move';

export function GuessTheMovePanel() {
  const tree = useAnalysis((state) => state.tree);
  const goTo = useAnalysis((state) => state.goTo);
  const currentId = useAnalysis((state) => state.currentId);
  const gameId = useAnalysis((state) =>
    state.document.kind === 'database-game' ? state.document.gameId : null,
  );
  const profile = useProfile();
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);

  /**
   * The moments the player marked on this game, if it is a model game.
   *
   * They do two things at once: they are the notes a player leaves for their
   * future self, and they are the list guess-the-move asks about when there is
   * one. Marking three decisions in a game and then working through exactly
   * those is the point — being quizzed on all forty is a different, duller
   * exercise.
   */
  const link = useQuery({
    queryKey: ['persistence', 'model-games', 'for-game', gameId ?? ''],
    enabled: Boolean(gameId),
    staleTime: 0,
    retry: false,
    queryFn: async () => (await getRepositories()).modelGames.forGame(gameId!),
  });
  /*
    Memoized because the `?? []` would otherwise be a fresh array on every
    render, and the targets memo below depends on it — which would mean
    recomputing the guess list for a game that has not changed.
  */
  const moments = useMemo(() => link.data?.[0]?.keyMoments ?? [], [link.data]);

  const suggested = guessColorFor(tree, profile.data?.aliases ?? []);
  const [color, setColor] = useState<'w' | 'b'>(suggested ?? 'w');
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [result, setResult] = useState<GuessResult | null>(null);

  const targets = useMemo(() => {
    const marked = moments
      .filter((moment) => moment.guess !== false && moment.nodeId)
      .map((moment) => moment.nodeId as NodeId);
    return guessTargets(tree, { color, ...(marked.length ? { onlyNodeIds: marked } : {}) });
  }, [tree, color, moments]);

  const markMoment = async (kind: KeyMomentKind) => {
    if (!gameId) {
      notify({
        tone: 'info',
        message: 'Key moments belong to a stored game.',
        detail: 'Open this game from Games to mark moments in it.',
      });
      return;
    }
    const node = tree.nodes[currentId];
    if (!node) return;
    try {
      await storeMoment(gameId, currentId, node.ply, node.fen, kind);
      invalidateModelGames(client);
      void client.invalidateQueries({ queryKey: ['persistence', 'model-games', 'for-game'] });
      notify({ tone: 'success', message: `Marked as ${KEY_MOMENT_LABEL[kind].toLowerCase()}.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not mark that moment.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const target = targets[index];

  const restart = (next: 'w' | 'b') => {
    setColor(next);
    setIndex(0);
    setTally(EMPTY_TALLY);
    setResult(null);
  };

  const submit = (moves: readonly AcceptedMove[]) => {
    const guess = moves.at(-1);
    if (!guess || !target) return;
    const judged = judgeGuess(guess, target);
    setResult(judged);
    setTally((current) => recordGuess(current, judged));
    // Show the game move immediately: the value is in seeing what was played
    // beside what you chose, not in a second click.
    goTo(target.nodeId as NodeId);
  };

  const next = () => {
    setResult(null);
    setIndex((current) => Math.min(current + 1, targets.length));
    const upcoming = targets[Math.min(index + 1, targets.length - 1)];
    if (upcoming) goTo(upcoming.fromNodeId as NodeId);
  };

  return (
    <Panel className="h-full">
      <PanelHeader>
        Guess the move
        <span className="normal-case tracking-normal text-tertiary tabular">
          {tally.matched} of {tally.attempted}
        </span>
      </PanelHeader>
      <PanelBody className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-tertiary">Follow</span>
          <Segmented
            items={[
              { id: 'w' as const, label: tree.headers.White ?? 'White' },
              { id: 'b' as const, label: tree.headers.Black ?? 'Black' },
            ]}
            value={color}
            onChange={restart}
          />
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-tertiary hover:text-secondary">
            Mark this moment{moments.length ? ` · ${moments.length} marked` : ''}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {KEY_MOMENT_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => void markMoment(kind)}
                className="rounded-[4px] border border-line px-1.5 py-0.5 text-[10px] text-tertiary hover:border-accent/50 hover:text-primary"
              >
                {KEY_MOMENT_LABEL[kind]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
            Your labels, never generated. Once a game has marked moments, this asks about those
            instead of every move.
          </p>
        </details>

        {targets.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nothing to guess here."
              description="This game has no moves for that side past the opening. Open a longer game, or switch sides."
            />
          </div>
        ) : !target ? (
          <div className="mt-3">
            <p className="text-xs text-primary">
              End of the game. {tally.matched} of {tally.attempted} matched what was played.
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
              A different move is not a worse one — it is what one player chose on one day.
            </p>
            <Button className="mt-2" onClick={() => restart(color)}>
              Start again
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[10.5px] text-tertiary tabular">
              Move {Math.ceil(target.ply / 2)} · {index + 1} of {targets.length}
            </p>
            {result ? (
              <div className="mt-2">
                <p
                  className={cn(
                    'text-xs',
                    result.outcome === 'match' ? 'text-positive' : 'text-secondary',
                  )}
                >
                  {result.message}
                </p>
                <Button variant="accent" className="mt-2" onClick={next}>
                  Next position
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-[10.5px] leading-relaxed text-tertiary">
                  What did{' '}
                  {color === 'w'
                    ? (tree.headers.White ?? 'White')
                    : (tree.headers.Black ?? 'Black')}{' '}
                  play here?
                </p>
                <div className="mt-2">
                  <AnswerBoard
                    fen={target.fen as never}
                    moves={[]}
                    onChange={submit}
                    multiple={false}
                    orientation={color}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

/** Exported for the workspace, which shows the cursor at the right position. */
export const guessStartNode = (
  tree: Parameters<typeof guessTargets>[0],
  color: 'w' | 'b',
): NodeId | null => (guessTargets(tree, { color })[0]?.fromNodeId as NodeId | undefined) ?? null;

/**
 * Record one key moment against a game's model-game link.
 *
 * At module scope because it reads the clock, which React's purity rule is
 * right to keep out of a component body — and because it re-reads the link
 * rather than trusting whatever was rendered a moment ago.
 */
async function storeMoment(
  gameId: string,
  nodeId: NodeId,
  ply: number,
  fen: string,
  kind: KeyMomentKind,
): Promise<void> {
  const repositories = await getRepositories();
  const moment: ModelGameKeyMoment = {
    id: stableId('moment'),
    nodeId,
    ply,
    positionKey: positionKey(fen),
    fen: fen as never,
    kind,
    guess: true,
    createdAt: Date.now(),
  };
  const existing = (await repositories.modelGames.forGame(gameId))[0];
  if (existing) {
    await repositories.modelGames.update({
      ...existing,
      keyMoments: [...(existing.keyMoments ?? []), moment],
    });
    return;
  }
  // Marking a moment in a game that is not yet a model game is a clear
  // statement that it should be one.
  const created = await repositories.modelGames.create({ gameId, kinds: ['model'], tags: [] });
  await repositories.modelGames.update({ ...created, keyMoments: [moment] });
}
