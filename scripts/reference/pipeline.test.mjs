import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { reduceExplorer, requiredGames } from '../build-reference-pack.mjs';
import { readGames } from './pgn-stream.mjs';

describe('reference pipeline evidence counts', () => {
  it('excludes an illegal suffix before emitting any rows and deduplicates relays in statistics', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-pipeline-'));
    try {
      const pgn = path.join(dir, 'fixture.pgn');
      const headers =
        '[White "Alpha"]\n[Black "Beta"]\n[WhiteElo "2500"]\n[BlackElo "2500"]\n[Date "2026.01.01"]\n[Result "1-0"]\n';
      const moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6';
      writeFileSync(
        pgn,
        [
          `${headers}\n${moves} 1-0`,
          `${headers}\n${moves} 1-0`,
          `${headers.replace('Alpha', 'Illegal')}\n${moves} 4. Qh9 1-0`,
          `${headers}[WhiteTitle "BOT"]\n\n${moves} 1-0`,
          `${headers}[Event "TCEC"]\n\n${moves} 1-0`,
        ].join('\n\n') + '\n',
      );
      const limits = {
        minPlies: 2,
        minRating: 2000,
        openRating: 2000,
        maxRating: 2900,
        titles: [],
        openTitles: [],
        maxPly: 4,
        thisYear: 2026,
        excludeOnline: true,
        topGames: 3,
        maxMoves: 256,
        minGames: 1,
      };
      const result = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./scan.worker.mjs', import.meta.url), {
          workerData: {
            file: pgn,
            outDir: dir,
            limits,
            shards: { explorer: 1, game: 1, players: 1, playergames: 1 },
          },
        });
        let result;
        worker.on('message', (message) => {
          result = message;
        });
        worker.on('error', reject);
        worker.on('exit', (code) =>
          code === 0 && result && !result.error
            ? resolve(result)
            : reject(new Error(result?.error ?? `exit ${code}`)),
        );
      });
      expect(result).toMatchObject({ seen: 5, kept: 2, rejected: 1, opened: 2 });
      const raw = readFileSync(path.join(dir, 'explorer/0.txt'), 'utf8').trim().split('\n');
      expect(raw).toHaveLength(8); // Four positions, two identical relay records.
      expect(readFileSync(path.join(dir, 'players/0.txt'), 'utf8')).not.toContain('Illegal');
      const accepted = readFileSync(path.join(dir, 'accepted/0.txt'), 'utf8').trim().split('\n');
      expect(new Set(accepted).size).toBe(1);
      const entries = [];
      await reduceExplorer(path.join(dir, 'explorer/0.txt'), limits, 2025, {
        encodeExplorerLine: (entry) => {
          entries.push(entry);
          return entry.key;
        },
      });
      expect(entries).toHaveLength(4);
      for (const entry of entries) {
        expect(entry.moves).toHaveLength(1);
        expect(entry.moves[0]).toMatchObject({
          games: 1,
          white: 1,
          recentGames: 1,
          averageRating: 2500,
        });
        expect(entry.games).toHaveLength(1);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps moves after a semicolon comment on a subsequent line', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-pgn-lines-'));
    try {
      const file = path.join(dir, 'lines.pgn');
      writeFileSync(file, '[Result "*"]\n\n1. e4 e5 ; a comment\n2. Nf3 Nc6 *\n');
      const games = [];
      for await (const game of readGames(file)) games.push(game);
      expect(games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The threshold that decides whether an explorer answers past move twelve.
   *
   * A single number cannot be right at both ends of the tree: near the start
   * every position has thousands of games and the threshold is inert, and past
   * the opening the same number is the thing that empties the panel. These pin
   * the tiered rule, including its default — a pack that states no deep tier
   * must keep behaving exactly as it did.
   */
  describe('frequency pruning', () => {
    it('uses one threshold everywhere when a pack states no deep tier', () => {
      const limits = { minGames: 3 };
      expect(requiredGames(limits, 0)).toBe(3);
      expect(requiredGames(limits, 40)).toBe(3);
    });

    it('relaxes the threshold at and beyond the stated depth', () => {
      const limits = { minGames: 3, deepFromPly: 24, deepMinGames: 1 };
      expect(requiredGames(limits, 23)).toBe(3);
      expect(requiredGames(limits, 24)).toBe(1);
      expect(requiredGames(limits, 40)).toBe(1);
    });

    it('keeps a deep position that a flat threshold would have deleted', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-prune-'));
      try {
        const rows = path.join(dir, 'explorer.txt');
        // Two positions: a shallow one reached once, and a deep one reached
        // once. Only the deep one is past the tier boundary.
        writeFileSync(
          rows,
          [
            ['shallow', 'e4', 'e2e4', '1-0', '2600', '2026', '2', 'g1', '2600', '1'].join('\t'),
            ['deep', 'Nf3', 'g1f3', '1-0', '2600', '2026', '30', 'g1', '2600', '1'].join('\t'),
          ].join('\n') + '\n',
        );
        const kept = [];
        const limits = {
          maxPly: 41,
          minGames: 2,
          deepFromPly: 24,
          deepMinGames: 1,
          maxMoves: 8,
          topGames: 2,
        };
        await reduceExplorer(rows, limits, 2025, {
          encodeExplorerLine: (entry) => {
            kept.push(entry.key);
            return entry.key;
          },
        });
        expect(kept).toEqual(['deep']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
