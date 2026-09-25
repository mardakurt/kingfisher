/**
 * The companion's move search, across the real boundary: games prepared by
 * the browser's own import code (normalise, index, line index) are written
 * into a SQLite collection file, searched by the companion on worker
 * threads, and must come back with exactly the games and plies `scanGame`
 * finds in the same trees.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { playUciAt, positionAt } from '@/chess/game';
import { serializePgn } from '@/chess/pgn';
import { isOk } from '@/chess/result';
import { createTree } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';

import { GameDatabase } from '../../companion/src/database.mjs';
import { scanGame, type DeepQuery } from './game-scan';
import { lineIndexForTree, THEMES_VERSION_NUMBER } from './line-index-encode';
import { parseMaterialQuery } from './material-query';
import { parseRoute } from './route';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomGame(seed: number): GameTree {
  const random = seeded(seed);
  let tree = createTree(START_FEN, { White: `White ${seed}`, Black: `Black ${seed}`, Result: '*' });
  let cursor: NodeId = tree.rootId;
  for (let ply = 0; ply < 60 + (seed % 60); ply += 1) {
    const moves = positionAt(tree, cursor).legalMoves();
    if (moves.length === 0) break;
    const played = playUciAt(tree, cursor, moves[Math.floor(random() * moves.length)]!.uci);
    if (!isOk(played)) break;
    tree = played.value.tree;
    cursor = played.value.nodeId;
  }
  return tree;
}

const directory = mkdtempSync(path.join(tmpdir(), 'kf-move-search-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function collection(trees: readonly GameTree[], withLines: (index: number) => boolean) {
  const database = new GameDatabase(path.join(directory, `c${Math.random()}.sqlite`));
  const fingerprints: string[] = [];
  database.insertGames(
    trees.map((tree, index) => {
      const record = normalizeGame(tree);
      fingerprints.push(record.fingerprint);
      const positions = indexGame(record);
      return {
        game: {
          fingerprint: record.fingerprint,
          white: record.white,
          black: record.black,
          whiteKey: record.whiteKey,
          blackKey: record.blackKey,
          result: record.result,
          plyCount: positions.length,
          importedAt: 1,
        },
        pgn: serializePgn(record.tree),
        positions,
        ...(withLines(index) ? { line: lineIndexForTree(record.tree) } : {}),
      };
    }),
  );
  return { database, fingerprints };
}

const material = (text: string) => {
  const parsed = parseMaterialQuery(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.query;
};
const route = (text: string) => {
  const parsed = parseRoute(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.route;
};

const QUESTIONS: { deep: DeepQuery; text: Record<string, unknown> }[] = [
  { deep: { material: { query: material('R v B') } }, text: { material: { text: 'R v B' } } },
  { deep: { material: { query: material('Q v Q') } }, text: { material: { text: 'Q v Q' } } },
  {
    deep: { material: { query: material('RB v R'), colour: 'w' } },
    text: { material: { text: 'RB v R', colour: 'w' } },
  },
  { deep: { theme: 'opposite-coloured-bishops' }, text: { theme: 'opposite-coloured-bishops' } },
  { deep: { route: { route: route('N g1 f3') } }, text: { route: { text: 'N g1 f3' } } },
  {
    deep: { route: { route: route('N b1 c3 d5'), colour: 'w' } },
    text: { route: { text: 'N b1–c3–d5', colour: 'w' } },
  },
];

describe('the companion’s move search', () => {
  const trees = Array.from({ length: 120 }, (_, index) => randomGame(index + 1));

  it('finds exactly the games and plies the scan finds', async () => {
    const { database, fingerprints } = collection(trees, () => true);
    for (const { deep, text } of QUESTIONS) {
      const expected = new Map<string, number>();
      trees.forEach((tree, index) => {
        const hit = scanGame(normalizeGame(tree).tree, deep);
        if (hit) expected.set(fingerprints[index]!, hit.ply);
      });
      const result = await database.moveSearch(
        {},
        { themesVersion: THEMES_VERSION_NUMBER, ...text },
        {
          workers: 3,
        },
      );
      expect(result).toMatchObject({ selected: 120, scanned: 120, unindexed: 0, unanswerable: 0 });
      expect(result.slices).toBeGreaterThanOrEqual(1);
      const got = new Map(
        result.hits.map((hit) => [String(hit.game.fingerprint), hit.ply] as const),
      );
      expect(got, JSON.stringify(text)).toEqual(expected);
    }
    // At least one question is answered by several games: not a vacuous comparison.
    database.close();
  });

  it('counts the games imported before the index, serves them for the old path, and stores their lines', async () => {
    const { database } = collection(trees.slice(0, 30), (index) => index % 3 !== 0);
    const result = await database.moveSearch(
      {},
      { themesVersion: THEMES_VERSION_NUMBER, material: { text: 'Q v Q' } },
    );
    expect(result).toMatchObject({ selected: 30, scanned: 20, unindexed: 10 });
    const page = database.exportPage(null, 100, {}, { positions: 'line', unindexedOnly: true });
    expect(page.games).toHaveLength(10);
    const stored = database.storeLines(
      page.games.map((game) => ({
        id: String(game.summary.id),
        data: lineIndexForTree(trees[Number(game.summary.id) - 1]!)!,
      })),
    );
    expect(stored.stored).toBe(10);
    expect(
      (
        await database.moveSearch(
          {},
          { themesVersion: THEMES_VERSION_NUMBER, material: { text: 'Q v Q' } },
        )
      ).unindexed,
    ).toBe(0);
    database.close();
  });

  it('narrows a comment query to the PGNs holding the text', () => {
    const { database } = collection([trees[0]!, trees[1]!], () => true);
    expect(
      database.exportPage(null, 10, {}, { positions: false, pgnContains: 'White 1' }).games,
    ).toHaveLength(1);
    expect(
      database.exportPage(null, 10, {}, { positions: false, pgnContains: 'zugzwang' }).games,
    ).toHaveLength(0);
    database.close();
  });

  it('refuses a question it cannot parse, rather than guessing', async () => {
    const { database } = collection(trees.slice(0, 5), () => true);
    await expect(
      database.moveSearch(
        {},
        { themesVersion: THEMES_VERSION_NUMBER, material: { text: 'banana' } },
      ),
    ).rejects.toThrow();
    database.close();
  });
});
