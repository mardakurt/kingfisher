'use client';

/**
 * Running the costly-moves report (`src/preparation/costly-moves.ts`) over an
 * opponent's games: one engine session, created for the run and disposed
 * after it, a fixed time per position, newest games first, results as they
 * come, and a Stop that means stop.
 *
 * UCI output carries no request identity, so every answer is checked against
 * the position it was asked about before it is used.
 */

import { create } from 'zustand';

import { Position } from '@/chess/position';
import type { Fen } from '@/chess/types';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';
import type { GameRecord } from '@/persistence/types';
import {
  evaluateGame,
  opponentMoves,
  type CostlyMove,
  type EngineView,
} from '@/preparation/costly-moves';

export interface CostlyRun {
  /** The opponent the run is about, so a report never outlives its subject. */
  readonly subject: string;
  readonly engineName: string;
  readonly msPerPosition: number;
  readonly gamesPlanned: number;
  readonly gamesDone: number;
  readonly entries: readonly CostlyMove[];
  readonly unanswered: number;
  /**
   * The depth of every answer, for a median. A range would be misleading:
   * Stockfish reports depth 245 for a position with one legal move.
   */
  readonly depths: readonly number[];
}

interface CostlyState {
  status: 'idle' | 'running' | 'done' | 'stopped' | 'error';
  run: CostlyRun | null;
  message: string | null;
  start(input: {
    readonly subject: string;
    readonly games: readonly GameRecord[];
    readonly aliases: readonly string[];
    readonly engineId: string;
    readonly maxGames: number;
    readonly msPerPosition: number;
  }): Promise<void>;
  stop(): void;
  reset(): void;
}

let generation = 0;
let active: EngineSession | null = null;
let abort: AbortController | null = null;

const newestFirst = (games: readonly GameRecord[]) =>
  [...games].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

export const useCostlyMoves = create<CostlyState>((set, get) => ({
  status: 'idle',
  run: null,
  message: null,
  stop: () => {
    abort?.abort();
    active?.stop();
    if (get().status === 'running') set({ status: 'stopped' });
  },
  reset: () => {
    generation += 1;
    abort?.abort();
    active?.stop();
    set({ status: 'idle', run: null, message: null });
  },
  start: async (input) => {
    const ticket = (generation += 1);
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    const chosen = newestFirst(input.games)
      .map((game) => opponentMoves(game, input.aliases))
      .filter((moves): moves is NonNullable<typeof moves> => moves !== null)
      .slice(0, input.maxGames);
    let session: EngineSession | null = null;
    try {
      const provider = engineProviderById(input.engineId);
      if (!provider) throw new Error(`Unknown engine: ${input.engineId}`);
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        throw new Error(availability.reason ?? 'The selected engine is unavailable.');
      }
      session = await provider.create({ multiPv: 1, threads: 1, hashMb: 32 });
      active = session;
      const engineName =
        session.identity.name || engineDefinition(input.engineId)?.name || input.engineId;
      let run: CostlyRun = {
        subject: input.subject,
        engineName,
        msPerPosition: input.msPerPosition,
        gamesPlanned: chosen.length,
        gamesDone: 0,
        entries: [],
        unanswered: 0,
        depths: [],
      };
      set({ status: 'running', run, message: null });

      const current = session;
      const evaluate = async (fen: Fen): Promise<EngineView | null> => {
        if (controller.signal.aborted) return null;
        const handle = current.analyse(
          { fen, limit: { kind: 'movetime', ms: input.msPerPosition } },
          () => undefined,
        );
        const analysis = await handle.finished;
        // An answer about another position is not evidence about this one.
        if (analysis.fen !== fen) return null;
        const best = [...analysis.lines].sort((a, b) => a.rank - b.rank)[0];
        if (!best?.score) return null;
        const uci = best.moves[0] ?? analysis.bestMove;
        const played = uci ? Position.fromTrustedFen(fen).playUci(uci) : null;
        const depth = best.depth ?? analysis.depth;
        run = { ...run, depths: [...run.depths, depth] };
        return {
          score: best.score,
          depth,
          ...(played?.ok ? { bestSan: played.value.san } : {}),
        };
      };

      const cache = new Map<string, EngineView | null>();
      for (const moves of chosen) {
        if (controller.signal.aborted || ticket !== generation) break;
        const { entries, unanswered } = await evaluateGame(
          moves,
          evaluate,
          cache,
          controller.signal,
        );
        if (ticket !== generation) return;
        if (controller.signal.aborted) break;
        run = {
          ...run,
          gamesDone: run.gamesDone + 1,
          entries: [...run.entries, ...entries],
          unanswered: run.unanswered + unanswered,
        };
        set({ run });
      }
      if (ticket !== generation) return;
      set({ status: controller.signal.aborted ? 'stopped' : 'done', run });
    } catch (error) {
      if (ticket !== generation) return;
      set({
        status: 'error',
        message: error instanceof Error ? error.message : 'The engine could not run.',
      });
    } finally {
      session?.dispose();
      if (active === session) active = null;
    }
  },
}));
