'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Position } from '@/chess/position';
import { engineDefinitions } from '@/engine/registry';
import type { Color, MoveIntent } from '@/chess/types';
import { Play, Stop } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Chessboard } from '@/features/board/Chessboard';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';

import {
  legalDestinations,
  playPracticeMove,
  startPracticeLine,
  takeBackToTurn,
  type PracticeLine,
} from './play-model';

const PROFILE_DEPTH = { quick: 8, standard: 13, deep: 18 } as const;
type Profile = keyof typeof PROFILE_DEPTH;

export function PlayFromHerePanel() {
  const startFen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen);
  const [side, setSide] = useState<Color>('w');
  const [profile, setProfile] = useState<Profile>('standard');
  const [line, setLine] = useState<PracticeLine | null>(null);
  const [thinking, setThinking] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);
  const prefs = usePreferences();
  const analyse = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);
  const selectEngine = useEngine((state) => state.selectEngine);
  const router = useRouter();
  const pathname = usePathname();
  const notify = useUi((state) => state.notify);

  const position = useMemo(() => (line ? Position.fromTrustedFen(line.fen) : null), [line]);
  const engines = engineDefinitions().filter((entry) => !prefs.hiddenEngineIds.includes(entry.id));
  const destinations = useMemo(
    () => (line && position?.turn === side && !stopped ? legalDestinations(line.fen) : new Map()),
    [line, position?.turn, side, stopped],
  );

  const stop = useCallback(() => {
    request.current += 1;
    stopEngine('primary');
    setThinking(false);
    setStopped(true);
  }, [stopEngine]);

  const waitForReply = useCallback(async (fen: PracticeLine['fen'], id: number) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (id !== request.current) return null;
      const slot = useEngine.getState().primary;
      const move = slot.analysedFen === fen ? slot.analysis?.lines[0]?.moves[0] : undefined;
      if (move) return move;
      if (slot.status === 'error' || slot.status === 'unavailable') return null;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!line || stopped || thinking || position?.turn === side || position?.outcome()) return;
    const id = ++request.current;
    void (async () => {
      // Start after the effect has yielded; React effects synchronise the
      // engine session, while state changes remain in the async workflow.
      await Promise.resolve();
      if (id !== request.current) return;
      setThinking(true);
      setProblem(null);
      try {
        await analyse(
          'primary',
          line.fen,
          { kind: 'depth', depth: PROFILE_DEPTH[profile] },
          { multiPv: 1, threads: prefs.engineThreads, hashMb: prefs.engineHashMb },
        );
        const reply = await waitForReply(line.fen, id);
        stopEngine('primary');
        if (id !== request.current) return;
        if (!reply) {
          setProblem(
            'The selected engine did not return a legal reply. The position was left unchanged.',
          );
          setStopped(true);
          return;
        }
        setLine((current) => {
          if (!current || current.fen !== line.fen) return current;
          const next = playPracticeMove(current, reply);
          return next.ok ? next.line : current;
        });
      } catch (error) {
        if (id === request.current) {
          setProblem(error instanceof Error ? error.message : 'The engine could not start.');
          setStopped(true);
        }
      } finally {
        if (id === request.current) setThinking(false);
      }
    })();
  }, [
    analyse,
    line,
    position,
    prefs.engineHashMb,
    prefs.engineThreads,
    profile,
    side,
    stopEngine,
    stopped,
    thinking,
    waitForReply,
  ]);

  if (!startFen) return <EmptyState title="No position is open." />;

  const start = () => {
    request.current += 1;
    setLine(startPracticeLine(startFen));
    setStopped(false);
    setProblem(null);
  };
  const move = (intent: MoveIntent) => {
    if (!line || position?.turn !== side || thinking || stopped) return;
    const next = playPracticeMove(line, intent);
    if (next.ok) setLine(next.line);
  };
  const analyzeAfter = () => {
    if (!line) return;
    const analysis = useAnalysis.getState();
    analysis.newGame(line.startFen);
    const inserted = analysis.insertUciLine(line.moves);
    if (!inserted.ok) {
      notify({
        tone: 'error',
        message: 'The practice line could not be opened.',
        detail: inserted.error.message,
      });
      return;
    }
    if (pathname !== '/analysis') router.push('/analysis');
    notify({ tone: 'success', message: 'Practice line opened in Analysis.' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          line && !stopped ? (
            <Button variant="subtle" icon={<Stop />} onClick={stop}>
              Stop
            </Button>
          ) : null
        }
      >
        Play from here
      </PanelHeader>
      <PanelBody className="p-3">
        {!line ? (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-secondary">
              Practise this exact position against the selected engine. The analysis board stays
              unchanged until you choose Analyze after.
            </p>
            <label className="block text-xs text-tertiary">
              Your side
              <select
                aria-label="Your side"
                value={side}
                onChange={(event) => setSide(event.target.value as Color)}
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
            <label className="block text-xs text-tertiary">
              Search profile
              <select
                aria-label="Search profile"
                value={profile}
                onChange={(event) => setProfile(event.target.value as Profile)}
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
              >
                <option value="quick">Quick · depth 8</option>
                <option value="standard">Standard · depth 13</option>
                <option value="deep">Deep · depth 18</option>
              </select>
            </label>
            <label className="block text-xs text-tertiary">
              Engine
              <select
                aria-label="Practice engine"
                value={prefs.primaryEngineId}
                onChange={(event) => {
                  const id = event.target.value;
                  prefs.set('primaryEngineId', id);
                  void selectEngine('primary', id);
                }}
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
              >
                {engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="accent" icon={<Play />} onClick={start}>
              Start practice
            </Button>
          </div>
        ) : (
          <>
            <Chessboard
              fen={line.fen}
              orientation={side}
              destinations={destinations}
              onMove={move}
              isPromotion={(from, to) => position?.requiresPromotion(from, to) ?? false}
              promotionColor={position?.turn ?? side}
              theme={prefs.boardTheme}
              pieceSet={prefs.pieceSet}
              coordinates={prefs.coordinateStyle}
              animationMs={resolveAnimationMs(prefs.animationSpeed)}
              className="mx-auto max-w-[360px]"
            />
            <p role="status" className="mt-2 text-xs text-secondary">
              {problem ??
                (position?.outcome()
                  ? 'The game has ended.'
                  : thinking
                    ? 'Engine is thinking…'
                    : stopped
                      ? 'Session stopped.'
                      : 'Your move.')}
            </p>
            <p className="mt-1 text-[11px] text-tertiary">
              {line.moves.length} ply · {line.moves.join(' ') || 'No moves yet'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="subtle"
                disabled={line.moves.length === 0 || thinking}
                onClick={() => setLine(takeBackToTurn(line, side))}
              >
                Take back
              </Button>
              <Button
                variant="subtle"
                disabled={thinking}
                onClick={() => {
                  setLine(startPracticeLine(line.startFen));
                  setStopped(false);
                  setProblem(null);
                }}
              >
                Restart
              </Button>
              <Button variant="subtle" disabled={line.moves.length === 0} onClick={analyzeAfter}>
                Analyze after
              </Button>
            </div>
          </>
        )}
      </PanelBody>
    </div>
  );
}
