'use client';

/**
 * An engine match in the background (`src/engine/match.ts`): one session per
 * engine, created for the match and disposed after it, so a late `bestmove`
 * from one game can never be read as a move in the next. The same engine may
 * play itself — two sessions — which is how a time handicap is measured.
 *
 * Results stay in memory until the person saves them: as a study, one chapter
 * per game, or as PGN on the clipboard. A match is an experiment, not authored
 * work, and nothing is written behind the person's back.
 */

import { create } from 'zustand';

import { parsePgn } from '@/chess/pgn';
import type { Fen, Uci } from '@/chess/types';
import {
  matchPgn,
  playMatchGame,
  validateMatchOptions,
  type MatchGame,
  type MatchOptions,
} from '@/engine/match';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';
import { getRepositories } from '@/persistence/repositories';
import { useEngine } from '@/stores/engine-store';

interface MatchState {
  status: 'idle' | 'running' | 'done' | 'error';
  startFen: Fen | null;
  names: { a: string; b: string } | null;
  options: MatchOptions | null;
  games: readonly MatchGame[];
  plies: number;
  stopped: boolean;
  error: string | null;
  start(fen: Fen, engineA: string, engineB: string, options: MatchOptions): Promise<void>;
  stop(): void;
  reset(): void;
  pgn(): string;
  saveAsStudy(): Promise<string>;
}

let controller: AbortController | null = null;

async function openSession(engineId: string): Promise<EngineSession> {
  const provider = engineProviderById(engineId);
  if (!provider) throw new Error(`Unknown engine: ${engineId}`);
  const availability = await provider.checkAvailability();
  if (!availability.available)
    throw new Error(
      availability.reason ?? `${engineDefinition(engineId)?.name ?? engineId} is unavailable.`,
    );
  return provider.create({ multiPv: 1, threads: 1, hashMb: 32 });
}

const label = (session: EngineSession, fallback: string): string =>
  [session.identity.name || fallback, session.identity.version].filter(Boolean).join(' ');

export const useMatch = create<MatchState>((set, get) => ({
  status: 'idle',
  startFen: null,
  names: null,
  options: null,
  games: [],
  plies: 0,
  stopped: false,
  error: null,
  stop: () => controller?.abort(),
  reset: () => {
    controller?.abort();
    set({ status: 'idle', games: [], plies: 0, error: null, stopped: false, names: null });
  },
  pgn: () => {
    const { startFen, games, names, options } = get();
    return startFen && names && options ? matchPgn(startFen, games, names, options) : '';
  },
  saveAsStudy: async () => {
    const { names, options } = get();
    const text = get().pgn();
    if (!text || !names || !options) throw new Error('There are no games to save.');
    const parsed = parsePgn(text);
    const repositories = await getRepositories();
    const study = await repositories.studies.create({
      title: `${names.a} v ${names.b} · ${options.msPerMove} ms a move`,
    });
    let index = 0;
    for (const game of parsed.games) {
      index += 1;
      await repositories.studies.createChapter({
        studyId: study.id,
        title: `Game ${index}: ${game.tree.headers.White ?? '?'} – ${game.tree.headers.Black ?? '?'}`,
        tree: game.tree,
      });
    }
    return study.id;
  },
  start: async (fen, engineA, engineB, options) => {
    if (get().status === 'running') return;
    validateMatchOptions(options);
    controller = new AbortController();
    const signal = controller.signal;
    set({
      status: 'running',
      startFen: fen,
      options,
      games: [],
      plies: 0,
      stopped: false,
      error: null,
      names: {
        a: engineDefinition(engineA)?.name ?? engineA,
        b: engineDefinition(engineB)?.name ?? engineB,
      },
    });
    // The panel's own engine competes for the same cores; a match measures
    // two engines, not two engines and a third.
    useEngine.getState().stop('primary');
    const sessions: Partial<Record<'a' | 'b', EngineSession>> = {};
    try {
      sessions.a = await openSession(engineA);
      sessions.b = await openSession(engineB);
      const nameA = label(sessions.a, engineA);
      let nameB = label(sessions.b, engineB);
      // The same engine on both sides is still two players; the PGN must say which is which.
      if (nameA === nameB) nameB = `${nameB} (second session)`;
      set({ names: { a: nameA, b: nameB } });
      const search = async (engine: 'a' | 'b', position: Fen, abort?: AbortSignal) => {
        const session = sessions[engine]!;
        const handle = session.analyse(
          { fen: position, limit: { kind: 'movetime', ms: options.msPerMove } },
          () => undefined,
        );
        const onAbort = () => handle.stop();
        abort?.addEventListener('abort', onAbort, { once: true });
        try {
          const analysis = await handle.finished;
          if (analysis.fen !== position)
            throw new Error('An engine answered about another position.');
          const best = [...analysis.lines].sort((x, y) => x.rank - y.rank)[0];
          return (best?.moves[0] ?? analysis.bestMove ?? null) as Uci | null;
        } finally {
          abort?.removeEventListener('abort', onAbort);
        }
      };
      for (let index = 0; index < options.games; index += 1) {
        const white = index % 2 === 0 ? 'a' : 'b';
        const game = await playMatchGame(fen, white, search, options.maxPlies, signal, (plies) =>
          set({ plies }),
        );
        if (!game) {
          set({ stopped: true });
          break;
        }
        set((state) => ({ games: [...state.games, game], plies: 0 }));
      }
      set({ status: 'done' });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'The match could not continue.',
      });
    } finally {
      sessions.a?.dispose();
      sessions.b?.dispose();
      controller = null;
    }
  },
}));
