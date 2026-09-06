/**
 * Opening a master game that Kingfisher may not redistribute.
 *
 * The PGN in these tests is the real response Lichess served for the game id
 * in its own API specification — Carlsen–Chadaev, World Blitz, Astana 2012 —
 * captured on 2026-09-06. Using a recorded real response rather than a
 * hand-written one is deliberate: the thing most likely to break here is the
 * shape of what the service actually sends, and a fixture somebody wrote to
 * match the parser cannot catch that. `npm run smoke:lichess -- --public` is
 * the half of this that hits the live service, and needs no credential.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseError, type ChessDatabaseProvider } from '@/database/types';
import { useAnalysis } from '@/stores/analysis-store';
import { mainlinePath } from '@/chess/tree/tree';

import { canOpenGames, openOnlineGame, OnlineGameUnavailableError } from './open-online-game';

const OTB_PGN = `[Event "Wch Blitz"]
[Site "Astana"]
[Date "2012.07.10"]
[Round "23"]
[White "Carlsen, Magnus"]
[Black "Chadaev, Nikolay"]
[Result "1-0"]
[WhiteElo "2837"]
[BlackElo "2580"]

1. e4 e5 2. f4 d5 3. exd5 exf4 4. Nf3 Nf6 5. c4 c6 6. d4 cxd5 7. c5 Nc6 8. Bb5 Be7 9. O-O O-O 10. Bxf4 Bg4 1-0
`;

const provider = (overrides: Partial<ChessDatabaseProvider> = {}): ChessDatabaseProvider =>
  ({
    id: 'lichess-masters',
    name: 'Masters',
    description: 'Over-the-board master games.',
    capabilities: {
      ratingFilter: false,
      dateFilter: true,
      playerFilter: false,
      topGames: true,
      offline: false,
    },
    explore: vi.fn(),
    game: vi.fn(async () => OTB_PGN),
    ...overrides,
  }) as ChessDatabaseProvider;

describe('opening an online master game', () => {
  beforeEach(() => {
    useAnalysis.getState().newGame();
  });

  it('puts the game on the board, through the same parser an import uses', async () => {
    await openOnlineGame(provider(), 'aAbqI4ey', 'Carlsen, Magnus – Chadaev, Nikolay');

    const state = useAnalysis.getState();
    const moves = mainlinePath(state.tree).map((id) => state.tree.nodes[id]?.move?.san);
    expect(moves.filter(Boolean).slice(0, 6)).toEqual(['e4', 'e5', 'f4', 'd5', 'exd5', 'exf4']);
  });

  /*
    Provenance, which for a game served by somebody else's database is the
    whole difference between studying it and pretending it is yours.
  */
  it('records which source served it, and under which id', async () => {
    await openOnlineGame(provider(), 'aAbqI4ey', 'Carlsen, Magnus – Chadaev, Nikolay');
    expect(useAnalysis.getState().document).toEqual({
      kind: 'reference-game',
      title: 'Carlsen, Magnus – Chadaev, Nikolay',
      sourceId: 'lichess-masters',
      sourceName: 'Masters',
      gameId: 'aAbqI4ey',
    });
  });

  it('asks the provider for the id it was given', async () => {
    const source = provider();
    await openOnlineGame(source, 'aAbqI4ey', 'title');
    expect(source.game).toHaveBeenCalledWith('aAbqI4ey', undefined);
  });

  /*
    A provider's own error already names the cause and the remedy — "connect
    Lichess in Settings", say. Replacing it with a generic sentence would throw
    away the only actionable part.
  */
  it('passes a provider error through rather than flattening it', async () => {
    const source = provider({
      game: vi.fn(async () => {
        throw new DatabaseError(
          'Lichess now requires authentication.',
          'Connect Lichess.',
          'authentication-required',
          401,
        );
      }),
    });
    await expect(openOnlineGame(source, 'x', 'title')).rejects.toThrow(DatabaseError);
    await expect(openOnlineGame(source, 'x', 'title')).rejects.toThrow(/requires authentication/);
  });

  it('refuses something that is not a game, rather than opening an empty board', async () => {
    const source = provider({ game: vi.fn(async () => 'not a pgn at all') });
    await expect(openOnlineGame(source, 'x', 'title')).rejects.toThrow(OnlineGameUnavailableError);
  });

  it('says so when a source serves no games at all', async () => {
    const source = provider({ game: undefined });
    expect(canOpenGames(source)).toBe(false);
    await expect(openOnlineGame(source, 'x', 'title')).rejects.toThrow(
      /does not serve whole games/,
    );
  });

  it('knows which sources can be opened', () => {
    expect(canOpenGames(provider())).toBe(true);
    expect(canOpenGames(null)).toBe(false);
    expect(canOpenGames(undefined)).toBe(false);
  });
});
