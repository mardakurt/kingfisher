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

import type { NodeId } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { AnswerBoard, type AcceptedMove } from '@/features/training/AnswerBoard';
import { useAnalysis } from '@/stores/analysis-store';
import { useProfile } from '@/features/persistence/queries';
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
  const profile = useProfile();

  const suggested = guessColorFor(tree, profile.data?.aliases ?? []);
  const [color, setColor] = useState<'w' | 'b'>(suggested ?? 'w');
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [result, setResult] = useState<GuessResult | null>(null);

  const targets = useMemo(() => guessTargets(tree, { color }), [tree, color]);
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
