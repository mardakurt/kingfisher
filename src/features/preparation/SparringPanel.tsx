'use client';

/**
 * Spar against the opponent you are preparing for, on the board itself.
 *
 * The partner plays the opponent's own moves for as long as the position is
 * one their games reached — chosen with the frequency they chose them and
 * announced with the count — and hands over to the engine, saying so, the
 * moment the game leaves their practice. See `src/preparation/sparring.ts`
 * for what that is and is not.
 *
 * It plays on the canonical board, not on a second one: every move, yours
 * and theirs, goes into the move tree the route already has open, so the game
 * is recorded, exportable, and can be analysed afterwards by turning the
 * engine on. The panel watches the board; when it is the opponent's turn on
 * the position the game reached, it replies. Step away from that position
 * and the partner waits rather than following you into your own analysis.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Color, Fen, Uci } from '@/chess/types';
import { Play, Stop } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { chooseBookReply, describeChoice, type SparringChoice } from '@/preparation/sparring';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { cn } from '@/lib/cn';

import { useSparringOpponent } from './sparring-store';

const STRENGTH = { quick: 8, standard: 13, deep: 18 } as const;
type Strength = keyof typeof STRENGTH;

interface LogEntry {
  readonly ply: number;
  readonly san: string;
  readonly source: 'book' | 'engine' | 'you';
  readonly detail: string;
}

interface Session {
  readonly mySide: Color;
  readonly startFen: Fen;
  /** The position the game has reached; the partner replies only from here. */
  readonly fen: Fen;
  readonly log: readonly LogEntry[];
  readonly stopped: boolean;
}

export function SparringPanel() {
  const opponent = useSparringOpponent((state) => state.opponent);
  const { node, position } = useAnalysisPosition();
  const play = useAnalysis((state) => state.play);
  const analyse = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);
  const engineName = useEngine((state) => state.primary.identity?.name ?? null);
  const prefs = usePreferences();

  const [mySide, setMySide] = useState<Color>('w');
  const [strength, setStrength] = useState<Strength>('standard');
  const [session, setSession] = useState<Session | null>(null);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);

  const opponentSide: Color = session ? (session.mySide === 'w' ? 'b' : 'w') : 'w';
  const onLine = session !== null && session.fen === node.fen;
  const outcome = position.outcome();

  const waitForReply = useCallback(async (fen: Fen, id: number): Promise<Uci | null> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (id !== request.current) return null;
      const slot = useEngine.getState().primary;
      const move = slot.analysedFen === fen ? slot.analysis?.lines[0]?.moves[0] : undefined;
      if (move && !slot.running) return move;
      if (slot.status === 'error' || slot.status === 'unavailable') return null;
    }
    // Still searching past the depth: take what it has.
    const slot = useEngine.getState().primary;
    return slot.analysedFen === fen ? (slot.analysis?.lines[0]?.moves[0] ?? null) : null;
  }, []);

  /* The partner's turn: reply from the games, or from the engine. */
  useEffect(() => {
    if (!session || !opponent || session.stopped || thinking) return;
    if (!onLine || position.turn !== opponentSide || outcome) return;
    const id = ++request.current;
    const fen = session.fen;
    void (async () => {
      await Promise.resolve();
      if (id !== request.current) return;
      setThinking(true);
      setProblem(null);
      try {
        const choice: SparringChoice = chooseBookReply(opponent.tree, fen);
        let uci: Uci | null = null;
        let source: 'book' | 'engine' = 'book';
        let detail = describeChoice(choice, opponent.name);
        if (choice.kind === 'book') {
          uci = choice.edge.uci;
        } else {
          source = 'engine';
          await analyse(
            'primary',
            fen,
            { kind: 'depth', depth: STRENGTH[strength] },
            { multiPv: 1, threads: prefs.engineThreads, hashMb: prefs.engineHashMb },
          );
          uci = await waitForReply(fen, id);
          stopEngine('primary');
          if (id !== request.current) return;
          detail = `${detail} ${
            engineName ?? useEngine.getState().primary.identity?.name ?? 'The engine'
          }, depth ${STRENGTH[strength]}.`;
        }
        if (!uci) {
          setProblem('The engine did not return a reply. The position was left unchanged.');
          setSession((current) => (current ? { ...current, stopped: true } : current));
          return;
        }
        // The board may have moved on while the engine thought.
        const live = useAnalysis.getState();
        const liveFen = live.tree.nodes[live.currentId]?.fen;
        if (liveFen !== fen) return;
        const replied = Position.fromTrustedFen(fen).playUci(uci);
        if (!replied.ok) {
          setProblem(`The reply ${uci} is not legal here. The position was left unchanged.`);
          setSession((current) => (current ? { ...current, stopped: true } : current));
          return;
        }
        const played = play({
          from: uci.slice(0, 2) as never,
          to: uci.slice(2, 4) as never,
          ...(uci.length > 4 ? { promotion: uci[4] as never } : {}),
        });
        if (!played.ok) {
          setProblem(played.error.message);
          return;
        }
        const after = useAnalysis.getState();
        const afterFen = after.tree.nodes[after.currentId]?.fen ?? replied.value.after;
        const ply = (after.tree.nodes[after.currentId]?.ply ?? 0) || 0;
        setSession((current) =>
          current && current.fen === fen
            ? {
                ...current,
                fen: afterFen,
                log: [...current.log, { ply, san: replied.value.san, source, detail }],
              }
            : current,
        );
      } catch (error) {
        if (id === request.current) {
          setProblem(error instanceof Error ? error.message : 'The partner could not move.');
          setSession((current) => (current ? { ...current, stopped: true } : current));
        }
      } finally {
        if (id === request.current) setThinking(false);
      }
    })();
  }, [
    analyse,
    engineName,
    onLine,
    opponent,
    opponentSide,
    outcome,
    play,
    position,
    prefs.engineHashMb,
    prefs.engineThreads,
    session,
    stopEngine,
    strength,
    thinking,
    waitForReply,
  ]);

  /*
    Your move went on the board: the game advances to where it landed. A
    subscription to the workspace rather than an effect on the rendered
    position, so the session follows the board as an external system and a
    move is never missed between renders.
  */
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    return useAnalysis.subscribe((state) => {
      const current = sessionRef.current;
      if (!current || current.stopped) return;
      const landed = state.tree.nodes[state.currentId];
      if (!landed || landed.fen === current.fen || !landed.move || !landed.parentId) return;
      const parent = state.tree.nodes[landed.parentId];
      if (!parent || parent.fen !== current.fen) return;
      const side = current.mySide === 'w' ? 'b' : 'w';
      if (Position.fromTrustedFen(landed.fen).turn !== side) return;
      const san = landed.move.san;
      setSession((previous) =>
        previous && previous.fen === parent.fen
          ? {
              ...previous,
              fen: landed.fen,
              log: [...previous.log, { ply: landed.ply, san, source: 'you', detail: '' }],
            }
          : previous,
      );
    });
  }, []);

  const bookNode = useMemo(
    () => (opponent ? opponent.tree.nodes.get(positionKey(node.fen)) : undefined),
    [node.fen, opponent],
  );

  if (!opponent) {
    return (
      <EmptyState
        title="No opponent loaded."
        description="Search a player above. The sparring partner plays their own moves from the games Kingfisher holds, and the engine after that."
      />
    );
  }

  const start = () => {
    request.current += 1;
    stopEngine('primary');
    setProblem(null);
    // Your side at the bottom, as at the board.
    const analysis = useAnalysis.getState();
    if (analysis.orientation !== mySide) analysis.flip();
    setSession({ mySide, startFen: node.fen, fen: node.fen, log: [], stopped: false });
  };
  const stop = () => {
    request.current += 1;
    stopEngine('primary');
    setThinking(false);
    setSession((current) => (current ? { ...current, stopped: true } : current));
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-sparring-panel>
      <PanelHeader
        actions={
          session && !session.stopped ? (
            <Button variant="subtle" icon={<Stop />} onClick={stop}>
              Stop
            </Button>
          ) : null
        }
      >
        Sparring · {opponent.name}
      </PanelHeader>
      <PanelBody className="space-y-3 p-3">
        <p className="text-[11px] leading-relaxed text-secondary">
          Plays {opponent.name}&apos;s own moves while the position is one their {opponent.games}{' '}
          selected {opponent.games === 1 ? 'game reaches' : 'games reach'}, as often as they played
          them; when the game leaves their practice, the engine takes over and the log says so. No
          style is inferred — every move is either their evidence or the engine&apos;s.
        </p>
        {!session ? (
          <div className="space-y-3">
            <label className="block text-xs text-tertiary">
              Your side
              <select
                aria-label="Your side"
                value={mySide}
                onChange={(event) => setMySide(event.target.value as Color)}
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
              >
                <option value="w">White — they have Black</option>
                <option value="b">Black — they have White</option>
              </select>
            </label>
            <label className="block text-xs text-tertiary">
              Engine strength once out of their games
              <select
                aria-label="Engine strength"
                value={strength}
                onChange={(event) => setStrength(event.target.value as Strength)}
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
              >
                <option value="quick">Quick · depth 8</option>
                <option value="standard">Standard · depth 13</option>
                <option value="deep">Deep · depth 18</option>
              </select>
            </label>
            <p className="text-[10.5px] text-tertiary">
              Starts from the position on the board.{' '}
              {bookNode
                ? `${opponent.name} reached it in ${bookNode.games} of the selected games.`
                : `${opponent.name}'s selected games do not reach it, so the engine would play from the first move.`}
            </p>
            <Button variant="accent" icon={<Play />} onClick={start} data-sparring-start>
              Start sparring
            </Button>
          </div>
        ) : (
          <>
            <p role="status" className="text-xs text-secondary" data-sparring-status>
              {problem ??
                (outcome
                  ? 'The game has ended.'
                  : session.stopped
                    ? 'Stopped. Start again from any position.'
                    : thinking
                      ? `${opponent.name} is choosing…`
                      : !onLine
                        ? 'Paused — the board has left the game. Go back to continue, or start again from here.'
                        : position.turn === session.mySide
                          ? 'Your move — play it on the board.'
                          : `${opponent.name} to move.`)}
            </p>
            <ol className="space-y-1" aria-label="Sparring move log">
              {session.log.map((entry, index) => (
                <li
                  key={`${entry.ply}-${index}`}
                  className={cn(
                    'rounded-[4px] border border-line-subtle px-2 py-1 text-[10.5px]',
                    entry.source === 'you' ? 'text-tertiary' : 'bg-surface-inset text-secondary',
                  )}
                >
                  <span className="mr-1.5 font-medium text-primary tabular">
                    {Math.ceil(entry.ply / 2)}
                    {entry.ply % 2 === 1 ? '.' : '…'} {entry.san}
                  </span>
                  {entry.source === 'you' ? null : (
                    <>
                      <span
                        className={cn(
                          'mr-1.5 rounded-[3px] px-1 py-px text-[9px] font-semibold tracking-wide uppercase',
                          entry.source === 'book'
                            ? 'bg-accent/15 text-accent'
                            : 'bg-surface-3 text-tertiary',
                        )}
                      >
                        {entry.source === 'book' ? 'Their games' : 'Engine'}
                      </span>
                      {entry.detail}
                    </>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="subtle" disabled={thinking} onClick={start}>
                Start again from here
              </Button>
            </div>
          </>
        )}
      </PanelBody>
    </div>
  );
}
