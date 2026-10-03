'use client';

/**
 * Tactics puzzles, rated.
 *
 * ChessBase for Mac advertises tactics puzzles "with difficulty ratings and
 * solver ratings"; this is Kingfisher's, from the Lichess puzzle database
 * (CC0) as `scripts/build-puzzles.mjs` curated it. Three choices shape it:
 *
 * - **The board is the route's own.** A puzzle is not an analysis document:
 *   playing it must not overwrite the game on the Analysis board, and an
 *   engine panel beside it would give the answer away. So the page takes over
 *   the workspace with a board and a panel, like Training's answer board.
 * - **The rating is derived, never stored.** Every attempt is kept (a
 *   portable store, in backups); the solver rating is Glicko-2 replayed over
 *   them. It is labelled as Kingfisher's, from this browser's attempts.
 * - **A hint or a wrong move ends the rated attempt.** The solution can still
 *   be played through, but the attempt is already recorded as unsolved —
 *   the rating is a record of what the solver found, not of what they were
 *   shown.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Shape } from '@/chess/annotations';
import { Position } from '@/chess/position';
import type { ChessMove, MoveIntent, Square } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Chessboard } from '@/features/board/Chessboard';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { Tactics } from '@/components/icons';
import { getRepositories } from '@/persistence/repositories';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';
import {
  answerPuzzle,
  choosePuzzle,
  puzzleLine,
  solverRating,
  type Puzzle,
  type PuzzleLine,
} from '@/training/puzzles';

import { loadPuzzleManifest, puzzleById, puzzlesNear, themeLabel } from './puzzle-data';

type Phase = 'loading' | 'solving' | 'solved' | 'failed' | 'empty' | 'error';

const DIFFICULTY = { easier: -250, normal: 0, harder: 250 } as const;
type Difficulty = keyof typeof DIFFICULTY;

/** Themes worth choosing from, in the order the set holds most of them. */
const HIDDEN_THEMES = new Set([
  'short',
  'long',
  'veryLong',
  'oneMove',
  'master',
  'masterVsMaster',
  'superGM',
  'middlegame',
  'endgame',
  'opening',
  'crushing',
  'advantage',
  'equality',
]);

export function PuzzlesWorkspace({ initialPuzzleId }: { readonly initialPuzzleId?: string }) {
  const preferences = usePreferences();
  const router = useRouter();
  const queryClient = useQueryClient();
  const manifest = useQuery({ queryKey: ['puzzles', 'manifest'], queryFn: loadPuzzleManifest });
  const attempts = useQuery({
    queryKey: ['puzzles', 'attempts'],
    queryFn: async () => (await getRepositories()).puzzleAttempts.list(),
  });
  const rating = useMemo(() => solverRating(attempts.data ?? []), [attempts.data]);
  const attempted = useMemo(
    () => new Set((attempts.data ?? []).map((attempt) => attempt.puzzleId)),
    [attempts.data],
  );

  const [theme, setTheme] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [line, setLine] = useState<PuzzleLine | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [lastMove, setLastMove] = useState<ChessMove | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<Square | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [lastResult, setLastResult] = useState<{ before: number; after: number } | null>(null);
  const played = useRef<string[]>([]);
  const started = useRef(0);
  // Seeded from the clock when the first puzzle is chosen, not during render.
  const seed = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const record = async (current: Puzzle, solved: boolean) => {
    if (recorded) return;
    setRecorded(true);
    const before = rating.rating;
    const repositories = await getRepositories();
    await repositories.puzzleAttempts.record({
      puzzleId: current.id,
      puzzleRating: current.rating,
      puzzleDeviation: current.deviation,
      themes: current.themes,
      solved,
      played: played.current,
      durationMs: Date.now() - started.current,
    });
    const list = await repositories.puzzleAttempts.list();
    queryClient.setQueryData(['puzzles', 'attempts'], list);
    setLastResult({ before, after: solverRating(list).rating });
  };

  const next = async (requested?: string) => {
    clearTimers();
    setPhase('loading');
    setMessage(null);
    setHint(null);
    setLastResult(null);
    try {
      const target = rating.rating + DIFFICULTY[difficulty];
      seed.current += 7919;
      const chosen = requested
        ? await puzzleById(requested)
        : choosePuzzle(await puzzlesNear(target), {
            target,
            attempted,
            theme: theme || null,
            seed: seed.current,
          });
      if (requested && !chosen) throw new Error(`There is no puzzle ${requested} in this set.`);
      if (!chosen) {
        setPuzzle(null);
        setPhase('empty');
        return;
      }
      const replay = puzzleLine(chosen);
      if (!replay.ok) throw new Error(`Puzzle ${chosen.id} does not play: ${replay.reason}`);
      setPuzzle(chosen);
      setLine(replay.line);
      setStep(0);
      setRecorded(false);
      played.current = [];
      // The position before the opponent's move, then the move itself.
      setPosition(Position.fromTrustedFen(replay.line.setup.before));
      setLastMove(null);
      timers.current.push(
        window.setTimeout(() => {
          setPosition(replay.line.start);
          setLastMove(replay.line.setup);
          setPhase('solving');
          started.current = Date.now();
        }, 450),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The puzzle set could not be read.');
      setPhase('error');
    }
  };

  // The first puzzle, once the attempts (and so the rating) are known.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !attempts.isSuccess) return;
    opened.current = true;
    seed.current = Date.now() % 1_000_000;
    void next(initialPuzzleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, after the attempts load
  }, [attempts.isSuccess]);

  const destinations = useMemo(() => {
    const map = new Map<Square, Square[]>();
    if (phase !== 'solving' || !position) return map;
    for (const move of position.legalMoves()) {
      const list = map.get(move.from);
      if (list) list.push(move.to);
      else map.set(move.from, [move.to]);
    }
    return map;
  }, [phase, position]);

  const onMove = (intent: MoveIntent) => {
    if (!puzzle || !line || !position || phase !== 'solving') return;
    const uci = `${intent.from}${intent.to}${intent.promotion ?? ''}`;
    const answer = answerPuzzle(line, step, position, uci);
    if (answer.kind === 'illegal') return;
    played.current = [...played.current, answer.move.uci];
    setHint(null);
    if (answer.kind === 'wrong') {
      setPosition(position.after(answer.move));
      setLastMove(answer.move);
      setPhase('failed');
      setMessage(
        `${answer.move.san} is not the solution. The puzzle wanted ${answer.expected.san}.`,
      );
      void record(puzzle, false);
      // Take the wrong move back so the solution can be shown from here.
      timers.current.push(
        window.setTimeout(() => {
          setPosition(position);
          setLastMove(null);
        }, 900),
      );
      return;
    }
    const after = position.after(answer.move);
    setPosition(after);
    setLastMove(answer.move);
    if (answer.solved) {
      setPhase('solved');
      setMessage(
        answer.alternativeMate
          ? `${answer.move.san} — checkmate, by another route than the listed one. Solved.`
          : 'Solved.',
      );
      void record(puzzle, true);
      return;
    }
    setMessage(`${answer.move.san} — correct. Keep going.`);
    const reply = answer.reply;
    if (reply) {
      timers.current.push(
        window.setTimeout(() => {
          setPosition(after.after(reply));
          setLastMove(reply);
          setStep((value) => value + 1);
        }, 350),
      );
    }
  };

  const showHint = () => {
    if (!puzzle || !line) return;
    const expected = line.solution[step * 2];
    if (!expected) return;
    setHint(expected.from);
    setMessage(
      'A hint ends the rated attempt: it is recorded as unsolved. You can still finish it.',
    );
    void record(puzzle, false);
  };

  const showSolution = () => {
    if (!puzzle || !line) return;
    clearTimers();
    if (!recorded) void record(puzzle, false);
    setPhase('failed');
    let at = Position.fromTrustedFen(line.setup.after);
    const remaining = line.solution;
    setPosition(at);
    remaining.forEach((move, index) => {
      timers.current.push(
        window.setTimeout(
          () => {
            at = Position.fromTrustedFen(move.after);
            setPosition(at);
            setLastMove(move);
          },
          500 * (index + 1),
        ),
      );
    });
    setMessage(`Solution: ${remaining.map((move) => move.san).join(' ')}`);
  };

  const shapes = useMemo<Shape[]>(
    () => (hint ? [{ kind: 'square' as const, square: hint, brush: 'green' as const }] : []),
    [hint],
  );

  const themes = useMemo(
    () =>
      Object.keys(manifest.data?.themes ?? {})
        .filter((name) => !HIDDEN_THEMES.has(name))
        .slice(0, 40),
    [manifest.data],
  );

  const ratingText = `${Math.round(rating.rating)}${rating.provisional ? '?' : ''}`;

  const panel = (
    <aside
      className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-line-subtle p-4 wide:w-[340px] wide:border-l"
      data-puzzle-panel
    >
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface-1 p-3">
        <p className="text-2xs uppercase tracking-wide text-tertiary">Your puzzle rating</p>
        <p className="text-2xl font-semibold text-primary tabular" data-puzzle-rating>
          {ratingText}
        </p>
        <p className="text-[11px] text-tertiary" data-puzzle-record>
          {rating.attempts} {rating.attempts === 1 ? 'attempt' : 'attempts'} · {rating.solved}{' '}
          solved
          {rating.provisional ? ' · provisional until the deviation settles' : ''}
        </p>
        {lastResult ? (
          <p className="mt-1 text-[11px] text-secondary tabular" data-puzzle-delta>
            {Math.round(lastResult.after - lastResult.before) >= 0 ? '+' : ''}
            {Math.round(lastResult.after - lastResult.before)} after this puzzle
          </p>
        ) : null}
        <p className="mt-2 text-[10.5px] leading-snug text-tertiary">
          Glicko-2 over the attempts kept in this profile, against each puzzle’s published rating.
          Not a Lichess rating.
        </p>
      </section>

      <section className="space-y-2">
        <label className="block text-xs text-secondary">
          Theme
          <select
            aria-label="Puzzle theme"
            className="mt-1 h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-sm text-primary"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            data-puzzle-theme
          >
            <option value="">Any theme</option>
            {themes.map((name) => (
              <option key={name} value={name}>
                {themeLabel(name)} ({manifest.data?.themes[name]?.toLocaleString()})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="group" aria-label="Difficulty">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((level) => (
            <Button
              key={level}
              {...(difficulty === level ? { variant: 'accent' as const } : {})}
              onClick={() => setDifficulty(level)}
              aria-pressed={difficulty === level}
            >
              {level === 'easier' ? 'Easier' : level === 'normal' ? 'Normal' : 'Harder'}
            </Button>
          ))}
        </div>
      </section>

      {puzzle ? (
        <section className="space-y-1 text-[12px]" data-puzzle-id={puzzle.id}>
          <p className="font-medium text-primary">
            {line?.solver === 'w' ? 'White' : 'Black'} to play
            {phase === 'solving' ? ' — find the best move' : ''}
          </p>
          {message ? (
            <p
              className={
                phase === 'failed'
                  ? 'text-danger'
                  : phase === 'solved'
                    ? 'text-success'
                    : 'text-secondary'
              }
              role="status"
              data-puzzle-message={phase}
            >
              {message}
            </p>
          ) : null}
          {phase === 'solved' || phase === 'failed' ? (
            <div className="space-y-0.5 pt-1 text-[11px] text-tertiary">
              <p data-puzzle-difficulty>
                Puzzle rating {puzzle.rating} (±{puzzle.deviation}) · played{' '}
                {puzzle.plays.toLocaleString()} times on Lichess
              </p>
              <p>{puzzle.themes.map(themeLabel).join(' · ')}</p>
              {puzzle.openings.length ? <p>{puzzle.openings[0]!.replace(/_/g, ' ')}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {phase === 'solving' ? (
          <>
            <Button onClick={showHint} data-puzzle-hint>
              Hint
            </Button>
            <Button onClick={showSolution} data-puzzle-solution>
              Show solution
            </Button>
          </>
        ) : null}
        {phase === 'failed' && line ? (
          <Button onClick={showSolution} data-puzzle-solution>
            Play the solution
          </Button>
        ) : null}
        <Button
          variant="accent"
          onClick={() => void next()}
          disabled={phase === 'loading'}
          data-puzzle-next
        >
          {phase === 'solving' ? 'Skip' : 'Next puzzle'}
        </Button>
        {puzzle && (phase === 'solved' || phase === 'failed') ? (
          <Button
            onClick={() =>
              router.push(`/analysis?fen=${encodeURIComponent(line?.setup.after ?? puzzle.fen)}`)
            }
          >
            Analyse
          </Button>
        ) : null}
      </div>
      {phase === 'solving' ? (
        <p className="text-[10.5px] text-tertiary">
          Skip records nothing. A hint or a wrong move records the attempt as unsolved.
        </p>
      ) : null}

      {phase === 'empty' ? (
        <p className="text-xs text-secondary" data-puzzle-empty>
          No unattempted puzzle near this rating
          {theme ? ` with the theme ${themeLabel(theme)}` : ''}. Try another theme or difficulty.
        </p>
      ) : null}
      {phase === 'error' && message ? (
        <p className="text-xs text-danger" role="alert">
          {message}
        </p>
      ) : null}

      <footer className="mt-auto pt-2 text-[10.5px] leading-snug text-tertiary">
        {manifest.data ? (
          <>
            {manifest.data.totals.shipped.toLocaleString()} puzzles chosen from the{' '}
            {manifest.data.totals.sourceRows.toLocaleString()} in the Lichess puzzle database (CC0,
            export of {manifest.data.sourceLastModified?.slice(5, 16) ?? manifest.data.builtAt}
            ), each replayed through Kingfisher’s rules. Works offline.
            {puzzle?.game ? (
              <>
                {' '}
                <a
                  className="underline hover:text-secondary"
                  href={`https://lichess.org/${puzzle.game}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source game
                </a>
                {phase === 'solving' ? ' (shows the answer)' : ''}.
              </>
            ) : null}
          </>
        ) : null}
      </footer>
    </aside>
  );

  return (
    <WorkspaceFrame
      workspace="puzzles"
      title="Puzzles"
      subtitle={puzzle && phase !== 'loading' ? `Puzzle ${puzzle.id}` : undefined}
      icon={<Tactics />}
      withMoveTree={false}
      takeover={
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:flex-row wide:overflow-hidden"
          data-puzzles
        >
          <div className="flex shrink-0 justify-center p-3 wide:flex-1 wide:items-center">
            <div
              className="aspect-square"
              // The largest square that fits: the column's width, the viewport
              // less the header, and a ceiling past which a board is no easier to read.
              style={{ width: 'min(100%, calc(100dvh - 140px), 760px)' }}
              data-puzzle-board
            >
              {position ? (
                <Chessboard
                  fen={position.fen}
                  orientation={line?.solver ?? 'w'}
                  lastMove={lastMove}
                  checkSquare={position.isCheck() ? position.kingSquare(position.turn) : null}
                  destinations={destinations}
                  onMove={onMove}
                  isPromotion={(from, to) => position.requiresPromotion(from, to)}
                  promotionColor={position.turn}
                  shapes={shapes}
                  theme={preferences.boardTheme}
                  pieceSet={preferences.pieceSet}
                  coordinates={preferences.coordinateStyle}
                  animationMs={resolveAnimationMs(preferences.animationSpeed)}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-line text-xs text-tertiary">
                  {phase === 'error' ? 'The puzzle set could not be read.' : 'Choosing a puzzle…'}
                </div>
              )}
            </div>
          </div>
          {panel}
        </div>
      }
    />
  );
}
