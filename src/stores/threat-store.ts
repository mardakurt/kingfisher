'use client';

/**
 * "What does the other side threaten?" — one short engine search of the
 * position with the turn passed (`nullMoveFen`), on its own session.
 *
 * The answer carries the position it was asked about, the engine that gave it
 * and the budget, and is dropped when the board has moved on: UCI output
 * carries no request identity, so the session is created for this one search
 * and disposed after it, and nothing it says can be read as evidence about the
 * next position.
 */

import { create } from 'zustand';

import { parseFen } from '@/chess/fen';
import { Position } from '@/chess/position';
import { nullMoveFen } from '@/chess/safety';
import type { Fen } from '@/chess/types';
import type { Score } from '@/chess/evaluation';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';

/** Long enough for a browser Stockfish to see a two- or three-move threat. */
export const THREAT_SEARCH_MS = 1500;

export interface ThreatAnswer {
  /** The position on the board the question was about. */
  readonly fen: Fen;
  /** The position actually searched: the same, with the turn passed. */
  readonly searchedFen: Fen;
  readonly engineName: string;
  readonly depth: number;
  readonly ms: number;
  readonly move: {
    readonly uci: string;
    readonly san: string;
    readonly from: string;
    readonly to: string;
  } | null;
  /** The continuation after the threat, in SAN, up to five moves. */
  readonly line: readonly string[];
  /** From White's point of view, as every engine score in Kingfisher. */
  readonly score: Score | null;
}

interface ThreatState {
  status: 'idle' | 'running' | 'done' | 'unavailable' | 'error';
  answer: ThreatAnswer | null;
  message: string | null;
  ask(fen: Fen, engineId: string): Promise<void>;
  reset(): void;
}

let active: EngineSession | null = null;
let generation = 0;

export const useThreats = create<ThreatState>((set) => ({
  status: 'idle',
  answer: null,
  message: null,
  reset: () => {
    generation += 1;
    active?.stop();
    set({ status: 'idle', answer: null, message: null });
  },
  ask: async (fen, engineId) => {
    const ticket = (generation += 1);
    const parsed = parseFen(fen);
    const searched = parsed.ok ? nullMoveFen(parsed.value) : null;
    if (!searched) {
      set({
        status: 'unavailable',
        answer: null,
        message: 'The side to move is in check, so there is no position with the turn passed.',
      });
      return;
    }
    set({ status: 'running', answer: null, message: null });
    let session: EngineSession | null = null;
    try {
      const provider = engineProviderById(engineId);
      if (!provider) throw new Error(`Unknown engine: ${engineId}`);
      const availability = await provider.checkAvailability();
      if (!availability.available)
        throw new Error(availability.reason ?? 'The selected engine is unavailable.');
      active?.stop();
      session = await provider.create({ multiPv: 1, threads: 1, hashMb: 16 });
      active = session;
      const handle = session.analyse(
        { fen: searched, limit: { kind: 'movetime', ms: THREAT_SEARCH_MS } },
        () => undefined,
      );
      const analysis = await handle.finished;
      if (ticket !== generation) return;
      if (analysis.fen !== searched) throw new Error('The engine answered about another position.');
      const best = [...analysis.lines].sort((a, b) => a.rank - b.rank)[0];
      const uci = best?.moves[0] ?? analysis.bestMove ?? null;
      let move: ThreatAnswer['move'] = null;
      const line: string[] = [];
      if (uci) {
        let position = Position.fromTrustedFen(searched);
        for (const step of (best?.moves ?? [uci]).slice(0, 5)) {
          const played = position.playUci(step);
          if (!played.ok) break;
          if (line.length === 0)
            move = {
              uci: played.value.uci,
              san: played.value.san,
              from: played.value.from,
              to: played.value.to,
            };
          line.push(played.value.san);
          position = position.after(played.value);
        }
      }
      set({
        status: 'done',
        answer: {
          fen,
          searchedFen: searched,
          engineName: session.identity.name || engineDefinition(engineId)?.name || engineId,
          depth: best?.depth ?? analysis.depth,
          ms: THREAT_SEARCH_MS,
          move,
          line,
          score: best?.score ?? null,
        },
      });
    } catch (error) {
      if (ticket !== generation) return;
      set({
        status: 'error',
        message: error instanceof Error ? error.message : 'The engine could not answer.',
      });
    } finally {
      session?.dispose();
      if (active === session) active = null;
    }
  },
}));
