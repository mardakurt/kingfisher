import { describe, expect, it } from 'vitest';
import { Position } from '@/chess/position';
import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn/parse';
import type { Fen } from '@/chess/types';
import type { ExplorerResult } from '@/database/types';
import { buildOpeningSurvey, openingSurveyPgn } from './opening-survey';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;
const source = { id: 'fixture', name: 'Test collection' };
function answer(position: Fen, ucis: readonly string[], truncated = false): ExplorerResult {
  const board = Position.fromTrustedFen(position);
  return {
    fen: position,
    source,
    totalGames: 100,
    white: 40,
    draws: 30,
    black: 30,
    truncated,
    moves: ucis.map((uci, index) => {
      const move = board.playUci(uci);
      if (!move.ok) throw new Error(move.error.message);
      return {
        uci: move.value.uci,
        san: move.value.san,
        games: 50 - index * 10,
        white: 20,
        draws: 10,
        black: 10,
      };
    }),
  };
}
const input = { fen, source, depth: 2, width: 2 };

describe('source-specific opening surveys', () => {
  it('orders by recorded frequency and exports legal variations and provenance', async () => {
    const survey = await buildOpeningSurvey({
      ...input,
      explore: async (position) => {
        const result = answer(position, position === fen ? ['e2e4', 'd2d4'] : ['e7e5', 'd7d5']);
        return { ...result, moves: [...result.moves].reverse() };
      },
    });
    expect(survey.queries).toBe(3);
    expect(Object.keys(survey.tree.nodes)).toHaveLength(7);
    expect(survey.tree.nodes[survey.tree.nodes[survey.tree.rootId]!.children[0]!]!.move?.uci).toBe(
      'e2e4',
    );
    const pgn = openingSurveyPgn(survey);
    expect(pgn).toContain('50 of 100 games');
    expect(pgn).toContain('does not mean best');
    expect(pgn).toContain('Test collection');
    expect(pgn).toContain('(1. d4');
    const parsed = parsePgn(pgn);
    expect(parsed.issues).toEqual([]);
    expect(Object.keys(parsed.games[0]!.tree.nodes)).toHaveLength(7);
  });
  it('bounds queries and marks incomplete output rather than claiming complete theory', async () => {
    const survey = await buildOpeningSurvey({
      ...input,
      maxQueries: 1,
      explore: async (position) => answer(position, ['e2e4', 'd2d4', 'g1f3'], true),
    });
    expect(survey.queries).toBe(1);
    expect(survey.stopped).toBe('query-limit');
    expect(survey.cuts).toBe(1);
    expect(openingSurveyPgn(survey)).toContain('omitted moves are not absent');
    expect(openingSurveyPgn(survey)).toContain('Status: query-limit');
  });
  it('records no-game positions without inventing moves', async () => {
    const survey = await buildOpeningSurvey({
      ...input,
      explore: async (position) => ({ ...answer(position, []), totalGames: 0 }),
    });
    expect(Object.keys(survey.tree.nodes)).toHaveLength(1);
    expect(openingSurveyPgn(survey)).toContain('0 games at this position');
  });
  it('rejects a response from another position or another source', async () => {
    for (const changed of [
      { source: { id: 'other', name: 'Other' } },
      {
        fen: '8/8/8/8/8/8/4K3/7k w - - 0 1' as Fen,
      },
    ]) {
      await expect(
        buildOpeningSurvey({
          ...input,
          explore: async (position) => ({ ...answer(position, []), ...changed }),
        }),
      ).rejects.toThrow('different position or population');
    }
  });
  it('returns a cancelled partial result without accepting a late response', async () => {
    const controller = new AbortController();
    const survey = await buildOpeningSurvey({
      ...input,
      signal: controller.signal,
      explore: async (position) => {
        controller.abort();
        return answer(position, ['e2e4']);
      },
    });
    expect(survey.stopped).toBe('cancelled');
    expect(Object.keys(survey.tree.nodes)).toHaveLength(1);
  });
  it('fails source errors and illegal or invalid evidence instead of exporting it', async () => {
    await expect(
      buildOpeningSurvey({
        ...input,
        explore: async () => {
          throw new Error('Offline');
        },
      }),
    ).rejects.toThrow('Offline');
    await expect(
      buildOpeningSurvey({
        ...input,
        explore: async (position) => ({
          ...answer(position, ['e2e4']),
          moves: [{ ...answer(position, ['e2e4']).moves[0]!, uci: 'e2e5' as never }],
        }),
      }),
    ).rejects.toThrow('illegal move');
    await expect(
      buildOpeningSurvey({
        ...input,
        explore: async (position) => ({ ...answer(position, []), totalGames: -1 }),
      }),
    ).rejects.toThrow('invalid game count');
  });
  it('validates bounds before making a request', async () => {
    await expect(
      buildOpeningSurvey({
        ...input,
        depth: NaN,
        explore: async (position) => answer(position, []),
      }),
    ).rejects.toThrow('Survey limits');
  });
  it('caches transpositions by canonical position and stops cycles', async () => {
    const graph = new Map<string, readonly string[]>();
    const add = (line: string[], moves: string[]) => {
      let board = Position.fromTrustedFen(fen);
      for (const move of line) {
        const played = board.playUci(move);
        if (!played.ok) throw new Error(played.error.message);
        board = Position.fromTrustedFen(played.value.after);
      }
      graph.set(positionKey(board.fen), moves);
    };
    add([], ['g1f3', 'b1c3']);
    add(['g1f3'], ['g8f6']);
    add(['b1c3'], ['g8f6']);
    add(['g1f3', 'g8f6'], ['b1c3']);
    add(['b1c3', 'g8f6'], ['g1f3']);
    add(['g1f3', 'g8f6', 'b1c3'], ['b8c6']);
    const keys: string[] = [];
    const survey = await buildOpeningSurvey({
      ...input,
      depth: 5,
      explore: async (position) => {
        keys.push(positionKey(position));
        return answer(position, graph.get(positionKey(position)) ?? []);
      },
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(survey.queries).toBe(7);
    const cycle = await buildOpeningSurvey({
      ...input,
      depth: 8,
      width: 1,
      explore: async (position) => {
        const board = Position.fromTrustedFen(position);
        const ply = Number(position.split(' ')[5]) * 2 - (position.split(' ')[1] === 'w' ? 2 : 1);
        return answer(board.fen, [['g1f3'], ['g8f6'], ['f3g1'], ['f6g8']][ply % 4]!);
      },
    });
    expect(cycle.queries).toBe(4);
    expect(openingSurveyPgn(cycle)).toContain('Repeated position');
  });
});
