import { describe, expect, it } from 'vitest';
import { parseSingleGame } from '@/chess/pgn';
import {
  filtersFromQuery,
  parseQuery,
  queryFromFilters,
  type GameQuery,
} from '@/database/query/ast';
import { executeQuery } from '@/database/query/execute';
import { createMemoryRepositories } from '@/persistence/repositories';
import { importGames } from '@/persistence/import-game';
import { needsTree, scanGame, scanLine } from './game-scan';

const PGN = `[Event "Source evidence"]
[Annotator "José Raúl Capablanca"]
[Source "Chess Fundamentals"]
[WhiteTeam "Havana"]
[BlackTeam "London"]
1. e4 e5 *`;

const treeOf = (pgn: string) => {
  const read = parseSingleGame(pgn);
  if (!read.ok) throw new Error('Bad fixture');
  return read.value.tree;
};

describe('PGN annotator, source and team filters', () => {
  it('reads only the recorded tags, excludes absent metadata and needs the PGN', () => {
    const tree = treeOf(PGN);
    expect(
      scanGame(tree, {
        metadata: { annotator: 'capablanca', source: 'fundamentals', team: 'london' },
      })?.ply,
    ).toBe(0);
    expect(scanGame(tree, { metadata: { team: 'HAVANA' } })?.ply).toBe(0);
    expect(scanGame(tree, { metadata: { annotator: 'Lasker' } })).toBeNull();
    expect(
      scanGame(treeOf('1. e4 {Capablanca, Chess Fundamentals, Havana} *'), {
        metadata: { annotator: 'Capablanca' },
      }),
    ).toBeNull();
    expect(needsTree({ metadata: { team: 'London' } })).toBe(true);
    expect(scanLine([], { metadata: { source: 'Chess' } })).toBeNull();
  });

  it('preserves every field in a saved mask and refuses unknown metadata', () => {
    const metadata = { annotator: 'Capablanca', source: 'Chess', team: 'London' };
    const saved = queryFromFilters({}, { metadata });
    expect(parseQuery(saved).ok).toBe(true);
    expect(filtersFromQuery(saved)?.moves.metadata).toEqual(metadata);
    expect(
      parseQuery({ version: 1, where: { type: 'metadata', field: 'beauty', contains: '99' } }).ok,
    ).toBe(false);
  });

  it('runs conjunctions and negation through the actual game repository', async () => {
    const repositories = createMemoryRepositories();
    await importGames(PGN, repositories.games);
    await importGames(
      '[Event "Other"]\n[Annotator "Lasker"]\n[Source "Chess Fundamentals"]\n1. d4 d5 *',
      repositories.games,
    );
    const query: GameQuery = {
      version: 1,
      where: {
        type: 'and',
        of: [
          { type: 'metadata', field: 'source', contains: 'Fundamentals' },
          { type: 'not', of: { type: 'metadata', field: 'annotator', contains: 'Lasker' } },
        ],
      },
    };
    const result = await executeQuery({ games: repositories.games, query });
    expect(result).toMatchObject({ status: 'done', selected: 2, read: 2, found: 1 });
    expect(result.matches[0]?.game.event).toBe('Source evidence');
    expect(result.matches[0]?.hit?.ply).toBe(0);
  });
});
