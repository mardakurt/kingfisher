import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/analysis-store', () => ({ useAnalysis: { getState: () => ({}) } }));

import { parsePgn } from '@/chess/pgn';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { scanGame, scanLine, type DeepQuery } from '@/search/game-scan';
import { parseMaterialQuery } from '@/search/material-query';
import { parseRoute } from '@/search/route';

import { setCompanion } from '@/companion/session';

import {
  companionMoveSearch,
  lineFromRows,
  librarySource,
  LOCAL_SOURCE,
  queryForSource,
} from './library-source';

describe('the database the Library shows', () => {
  it('reads a collection id into a source', () => {
    expect(librarySource('local')).toBe(LOCAL_SOURCE);
    expect(librarySource(null)).toBe(LOCAL_SOURCE);
    expect(librarySource('sqlite:twic-2026', 'TWIC 2026')).toEqual({
      kind: 'companion',
      id: 'sqlite:twic-2026',
      key: 'twic-2026',
      name: 'TWIC 2026',
    });
  });

  it('asks My games every filter, and a companion database all but the one it cannot read', () => {
    const query = { player: 'tal', event: 'olympiad', timeClass: 'blitz', limit: 100 } as const;
    expect(queryForSource(query, LOCAL_SOURCE)).toEqual({ query, dropped: [] });
    expect(queryForSource(query, librarySource('sqlite:x', 'X'))).toEqual({
      query: { player: 'tal', event: 'olympiad', limit: 100 },
      dropped: ['time control'],
    });
  });
});

describe('reading a companion game from its indexed rows', () => {
  const GAMES = [
    // A Najdorf that trades into rook against bishop at the end.
    '[SetUp "1"]\n[FEN "3r2k1/5ppp/8/8/2b5/8/5PPP/3R2K1 w - - 0 1"]\n\n1. Rxd8+ Kf7 2. Kf1 Ke6 *',
    '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Nbd7 8. O-O Be7 *',
    '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O dxc4 8. Bxc4 *',
    // The Exchange Spanish: Black keeps the bishop pair, White gave one up.
    '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4 *',
  ];
  const QUERIES = (): DeepQuery[] => {
    const material = parseMaterialQuery('R v B');
    const route = parseRoute('N b8 d7');
    if (!material.ok || !route.ok) throw new Error('queries');
    return [
      { material: { query: material.query } },
      { route: { route: route.route } },
      { theme: 'bishop-pair' },
    ];
  };

  it('answers every query exactly as the replayed game does', () => {
    for (const pgn of GAMES) {
      const tree = parsePgn(pgn).games[0]!.tree;
      const rows = indexGame(normalizeGame(tree, 1));
      const line = lineFromRows(rows);
      expect(line).not.toBeNull();
      for (const query of QUERIES()) {
        expect(scanLine(line!, query)?.ply ?? null).toBe(scanGame(tree, query)?.ply ?? null);
      }
    }
    // And the queries are not vacuous: each finds something in these games.
    const hits = QUERIES().map(
      (query) => GAMES.filter((pgn) => scanGame(parsePgn(pgn).games[0]!.tree, query)).length,
    );
    expect(hits.every((count) => count > 0)).toBe(true);
  });

  it('refuses rows with a gap — a repetition the index stored once — so the PGN is read instead', () => {
    const tree = parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. e4 *').games[0]!.tree;
    const rows = indexGame(normalizeGame(tree, 1));
    expect(rows.length).toBeLessThan(7);
    expect(lineFromRows(rows)).toBeNull();
    expect(lineFromRows([])).toBeNull();
  });
});

describe('the count a companion move search reports', () => {
  it('is every game that contains it, not the first few thousand the companion lists', async () => {
    // The transport is stubbed; the client, the session and the search are real.
    const game = (id: string) => ({ id, white: 'A', black: 'B', result: '*' });
    const fetchStub = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:4390/db/move-search');
      return new Response(
        JSON.stringify({
          selected: 1_048_440,
          scanned: 1_048_440,
          unindexed: 0,
          unanswerable: 0,
          // The companion counted 163,840 games and sent the first two.
          total: 163_840,
          hits: [
            { game: game('g1'), ply: 30 },
            { game: game('g2'), ply: 41 },
          ],
          slices: 12,
          elapsedMs: 4_300,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchStub);
    setCompanion({ url: 'http://127.0.0.1:4390', token: 't' });
    try {
      const state = await companionMoveSearch({
        source: librarySource('sqlite:lichess', 'Lichess') as Extract<
          ReturnType<typeof librarySource>,
          { kind: 'companion' }
        >,
        header: {},
        deep: { theme: 'opposite-coloured-bishops' },
      });
      expect(state.status).toBe('done');
      expect(state.matches).toHaveLength(2);
      expect(state.found).toBe(163_840);
      expect(state.read).toBe(1_048_440);
    } finally {
      setCompanion(null);
      vi.unstubAllGlobals();
    }
  });
});
