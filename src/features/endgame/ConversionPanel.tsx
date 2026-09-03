'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Position } from '@/chess/position';
import type { Color, MoveIntent, Square, Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Chessboard } from '@/features/board/Chessboard';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';
import { defaultTablebaseProvider } from '@/tablebase/registry';
import { describeCategory, eligibleForTablebase, type TablebaseResult } from '@/tablebase/types';
import { useEngine } from '@/stores/engine-store';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';

import {
  OPPONENT_STRENGTH_LABEL,
  OUTCOME_LABEL,
  strengthDepth,
  type OpponentStrength,
} from './conversion';
import { useConversion } from './conversion-store';

const provider = () => defaultTablebaseProvider();

const pieceCount = (fen: string): number =>
  [...(fen.split(' ')[0] ?? '')].filter((character) => /[prnbqk]/i.test(character)).length;

/**
 * Playing a theoretical endgame out, with the tablebase as referee.
 *
 * The engine is the opponent here, not the judge. Its evaluation is an
 * opinion; the tablebase's category is the answer, and it is the answer that
 * decides whether the player is still winning. Keeping those two roles apart
 * is the whole reason this is a separate surface from Analysis.
 */
export function ConversionPanel({
  fen,
  title,
  onSaved,
}: {
  readonly fen: string | null;
  readonly title: string;
  readonly onSaved?: () => void;
}) {
  const session = useConversion();
  const preferences = usePreferences();
  const analyse = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);
  const client = useQueryClient();
  const [side, setSide] = useState<Color>('w');
  const [strength, setStrength] = useState<OpponentStrength>('strong');
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<TablebaseResult | null>(null);

  const position = useMemo(
    () => (session.fen ? Position.fromTrustedFen(session.fen) : null),
    [session.fen],
  );

  const probe = useCallback(async (candidate: string): Promise<TablebaseResult | null> => {
    const source = provider();
    if (!eligibleForTablebase(pieceCount(candidate), source.maxPieces)) return null;
    try {
      return await source.probe(candidate as never);
    } catch {
      return null;
    }
  }, []);

  const begin = async () => {
    if (!fen) return;
    setError(null);
    const start = Position.fromFen(fen);
    if (!start.ok) {
      setError(start.error.message);
      return;
    }
    const result = await probe(start.value.fen);
    if (!result) {
      setError(
        'The tablebase cannot answer for this position, so there is nothing to referee the session with.',
      );
      return;
    }
    setVerdict(result);
    session.start({
      fen: start.value.fen,
      side,
      strength,
      title,
      category: result.category,
      sideToMove: start.value.turn,
    });
  };

  /*
    The opponent's move. It runs when it is the opponent's turn and the
    session is live; the ref guards against the effect firing twice for one
    position, which would have the engine play two moves in a row.
  */
  const replying = useRef<string | null>(null);
  useEffect(() => {
    if (!position || session.ending || session.startingOutcome === null) return;
    if (position.turn === session.side) return;
    if (replying.current === position.fen) return;
    replying.current = position.fen;

    let cancelled = false;
    const move = async () => {
      session.setThinking(true);
      const reply = await chooseReply(position, session.strength, {
        analyse,
        stopEngine,
        preferences,
        probe,
      });
      if (cancelled || !reply) {
        session.setThinking(false);
        return;
      }
      const played = position.playUci(reply);
      if (!played.ok) {
        session.setThinking(false);
        return;
      }
      const after = Position.fromTrustedFen(played.value.after);
      const result = await probe(after.fen);
      session.setThinking(false);
      if (cancelled || !result) return;
      setVerdict(result);
      session.record({
        fen: after.fen,
        san: played.value.san,
        by: position.turn,
        category: result.category,
        sideToMove: after.turn,
        halfmoveClock: after.halfmoveClock,
      });
    };
    void move();
    return () => {
      cancelled = true;
    };
    /*
      Narrowed deliberately. The effect reads store actions and preferences,
      all of which are stable or irrelevant to *whether the engine should
      move*; listing them would re-run the reply on an unrelated preference
      change. What must trigger it is the position, whose turn it is, and
      whether the session is over — and `replying` guards the double-fire that
      a re-render would otherwise cause.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, session.ending, session.side, session.startingOutcome, session.strength]);

  const onMove = async (intent: MoveIntent) => {
    if (!position || session.ending) return;
    const played = position.play(intent);
    if (!played.ok) return;
    const after = Position.fromTrustedFen(played.value.after);
    const result = await probe(after.fen);
    if (!result) return;
    setVerdict(result);
    session.record({
      fen: after.fen,
      san: played.value.san,
      by: position.turn,
      category: result.category,
      sideToMove: after.turn,
      halfmoveClock: after.halfmoveClock,
    });
  };

  const destinations = useMemo(() => {
    const map = new Map<Square, Square[]>();
    if (!position || position.turn !== session.side || session.ending) return map;
    for (const move of position.legalMoves()) {
      const existing = map.get(move.from);
      if (existing) {
        if (!existing.includes(move.to)) existing.push(move.to);
      } else {
        map.set(move.from, [move.to]);
      }
    }
    return map;
  }, [position, session.ending, session.side]);

  if (!session.fen || !position) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader>Play it out</PanelHeader>
        <PanelBody className="p-3">
          {!fen ? (
            <EmptyState
              title="Choose an endgame first."
              description="Pick a saved position, then play it out against the engine with the tablebase as referee."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-secondary">
                The engine plays the other side. After every move the tablebase says what the
                position is now worth — it reports what the result is, not what you did wrong.
              </p>
              <label className="text-xs text-tertiary">
                Play as
                <select
                  value={side}
                  onChange={(event) => setSide(event.target.value as Color)}
                  className="mt-1 h-9 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary"
                >
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </label>
              <label className="text-xs text-tertiary">
                Opponent
                <select
                  value={strength}
                  onChange={(event) => setStrength(event.target.value as OpponentStrength)}
                  className="mt-1 h-9 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary"
                >
                  {(Object.keys(OPPONENT_STRENGTH_LABEL) as readonly OpponentStrength[]).map(
                    (id) => (
                      <option key={id} value={id}>
                        {OPPONENT_STRENGTH_LABEL[id]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {error ? <p className="text-xs text-negative">{error}</p> : null}
              <Button onClick={() => void begin()}>Play it out</Button>
            </div>
          )}
        </PanelBody>
      </div>
    );
  }

  const change = session.history.at(-1)?.change ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          <Button
            size="sm"
            onClick={() => {
              stopEngine();
              session.stop();
              void client.invalidateQueries({ queryKey: ['endgame'] });
              onSaved?.();
            }}
          >
            Stop
          </Button>
        }
      >
        {session.title || 'Conversion'}
      </PanelHeader>
      <PanelBody className="p-3">
        <div className="mx-auto w-full max-w-[320px]">
          <Chessboard
            fen={position.fen}
            orientation={session.side}
            destinations={destinations}
            onMove={(intent) => void onMove(intent)}
            isPromotion={(from, to) => position.requiresPromotion(from, to)}
            promotionColor={position.turn}
            theme={preferences.boardTheme}
            pieceSet={preferences.pieceSet}
            coordinates="outside"
            animationMs={resolveAnimationMs(preferences.animationSpeed)}
          />
        </div>

        <div
          className="mt-3 flex items-center justify-between gap-3 border-y border-line-subtle py-2"
          data-conversion-status
        >
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-[0.08em] text-tertiary">Tablebase result</p>
            <p className="mt-0.5 text-sm text-primary">
              {session.currentOutcome ? OUTCOME_LABEL[session.currentOutcome] : '—'}
              {verdict ? (
                <span className="ml-2 text-2xs text-tertiary">
                  {describeCategory(verdict.category)}
                  {verdict.dtz !== null ? ` · DTZ ${Math.abs(verdict.dtz)}` : ''}
                </span>
              ) : null}
            </p>
          </div>
          <span className="shrink-0 text-2xs text-tertiary">
            {session.thinking
              ? 'Engine thinking…'
              : `Started as ${
                  session.startingOutcome ? OUTCOME_LABEL[session.startingOutcome] : '—'
                }`}
          </span>
        </div>

        {/*
          §53: a factual report about the position, never a verdict on the
          player. The tablebase knows the result changed; it does not know
          whether the move was a slip, an experiment, or a line the player
          understands better than the machine does.
        */}
        {change ? (
          <p
            role="status"
            data-conversion-change
            className={cn(
              'mt-3 rounded-[4px] border px-2.5 py-2 text-xs leading-relaxed',
              change.direction === 'worse'
                ? 'border-caution/40 bg-caution/10 text-primary'
                : 'border-positive/40 bg-positive/10 text-primary',
            )}
          >
            {change.message}
          </p>
        ) : null}

        {session.ending ? (
          <p
            role="status"
            data-conversion-ending
            className="mt-3 rounded-[4px] border border-line bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-primary"
          >
            {describeEnding(session.ending, session.side)}
          </p>
        ) : null}

        {session.history.length > 0 ? (
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-0.5 text-2xs text-secondary">
            {session.history.map((ply, index) => (
              <li key={`${ply.san}-${index}`} className={cn(ply.change && 'text-caution')}>
                {ply.san}
              </li>
            ))}
          </ol>
        ) : null}
      </PanelBody>
    </div>
  );
}

function describeEnding(
  ending: NonNullable<ReturnType<typeof useConversion.getState>['ending']>,
  side: Color,
): string {
  switch (ending.kind) {
    case 'checkmate':
      return ending.winner === side
        ? 'Checkmate. The conversion is complete.'
        : 'Checkmate against you. The session is over.';
    case 'stalemate':
      return 'Stalemate. The game is drawn.';
    case 'draw':
      return ending.reason;
    case 'result-lost':
      return `The position no longer holds the ${OUTCOME_LABEL[
        ending.from
      ].toLowerCase()} it started with, so the session ends here. Start it again to try the conversion from the beginning.`;
    case 'converted':
      return 'Converted.';
  }
}

/**
 * The opponent's reply.
 *
 * A tablebase-perfect opponent asks the tablebase and plays its best defence,
 * which is the only way to practise against a defence that never errs. The
 * engine strengths deliberately do not consult the tablebase: an opponent
 * that plays perfectly *and* is called "club strength" is a lie about the
 * exercise.
 */
async function chooseReply(
  position: Position,
  strength: OpponentStrength,
  deps: {
    analyse: ReturnType<typeof useEngine.getState>['analyse'];
    stopEngine: ReturnType<typeof useEngine.getState>['stop'];
    preferences: ReturnType<typeof usePreferences.getState>;
    probe: (fen: string) => Promise<TablebaseResult | null>;
  },
): Promise<Uci | null> {
  const legal = position.legalMoves();
  if (legal.length === 0) return null;

  if (strength === 'tablebase-perfect') {
    const result = await deps.probe(position.fen);
    const best = result?.moves[0];
    if (best) return best.uci;
  }

  try {
    await deps.analyse(
      'primary',
      position.fen,
      { kind: 'depth', depth: strengthDepth(strength) },
      {
        multiPv: 1,
        threads: deps.preferences.engineThreads,
        hashMb: deps.preferences.engineHashMb,
      },
    );
    const line = useEngine.getState().primary.analysis?.lines[0];
    deps.stopEngine('primary');
    const first = line?.moves[0];
    if (first) return first;
  } catch {
    // Falls through to a legal move: an engine that will not start must not
    // leave the session stuck with no reply at all.
  }
  return (legal[Math.floor(Math.random() * legal.length)] as (typeof legal)[number]).uci;
}
