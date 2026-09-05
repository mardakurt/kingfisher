/**
 * The decoder against a database En Croissant actually wrote.
 *
 * A schema can be read from documentation; a move encoding cannot be trusted
 * to it. En Croissant stores each move as an index into the list its rules
 * library generates, so a decoder that orders that list even slightly
 * differently produces moves that are legal, plausible, and not the ones that
 * were played. Nothing downstream could detect that, which is why this test
 * compares against ground truth rather than against expectations.
 *
 * The fixture in `__fixtures__` was produced by En Croissant 0.15.1's own
 * importer, encoder and insertion path (database format version 1.0.0) from 60
 * real broadcast games, and `.truth.tsv` is that same program's decoding of
 * what it had just encoded. Both are checked in, so this runs everywhere
 * without a Rust toolchain. Provenance is recorded in THIRD_PARTY_DATA.md.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Fen } from '@/chess/types';

import { decodeMainlineSan, decodeMoves } from './decode';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/en-croissant-0.15.db', import.meta.url));
const TRUTH = fileURLToPath(new URL('./__fixtures__/en-croissant-0.15.truth.tsv', import.meta.url));

interface Row {
  readonly ID: number;
  readonly FEN: string | null;
  readonly Moves: Uint8Array;
}

function fixtureGames(): Row[] {
  const database = new DatabaseSync(FIXTURE, { readOnly: true });
  const rows = database.prepare('SELECT ID, FEN, Moves FROM Games ORDER BY ID').all() as unknown[];
  database.close();
  return rows as Row[];
}

/** En Croissant's own decoding, reduced to the bare SAN of the mainline. */
function truthMainline(): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const line of readFileSync(TRUTH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const id = Number(line.slice(0, tab));
    let text = line.slice(tab + 1);
    // Strip what is not a move: comments, then NAGs, then variations
    // innermost-outwards, then move numbers.
    text = text.replace(/\{[^}]*\}/g, ' ');
    text = text.replace(/\$\d+/g, ' ');
    let previous: string;
    do {
      previous = text;
      text = text.replace(/\([^()]*\)/g, ' ');
    } while (text !== previous);
    text = text.replace(/\d+\.(\.\.)?/g, ' ');
    const moves = text
      .split(/\s+/)
      .filter((token) => token.length > 0 && !['1-0', '0-1', '1/2-1/2', '*'].includes(token));
    map.set(id, moves);
  }
  return map;
}

describe('the En Croissant move encoding', () => {
  const games = fixtureGames();
  const truth = truthMainline();

  it('has a fixture with the shapes that break a naive decoder', () => {
    // A decoder can be wrong only where the move list is interesting. If the
    // fixture ever loses its castling or promotions this test stops proving
    // what it claims, so it asserts on its own corpus first.
    const all = [...truth.values()].flat();
    expect(games.length).toBe(60);
    expect(all.filter((san) => san.startsWith('O-O')).length).toBeGreaterThan(50);
    expect(all.filter((san) => san.includes('=')).length).toBeGreaterThan(0);
    expect(all.filter((san) => san.includes('+')).length).toBeGreaterThan(100);
  });

  it('decodes every game to exactly the moves En Croissant decoded', { timeout: 60_000 }, () => {
    const mismatches: string[] = [];
    let moves = 0;

    for (const row of games) {
      const expected = truth.get(row.ID);
      if (!expected) continue;
      const decoded = decodeMainlineSan(
        new Uint8Array(row.Moves),
        (row.FEN ?? undefined) as Fen | undefined,
      );
      if (decoded === null) {
        mismatches.push(`game ${row.ID}: decoding failed outright`);
        continue;
      }
      moves += decoded.length;
      /*
        Normalised before comparing, because the two programs spell the same
        move differently at the end: Kingfisher writes the check and mate
        suffixes, and En Croissant additionally folds a move's NAG back into
        the SAN as `!`, `?`, `!?` or `?!`. Neither is part of the move. The
        squares are, and those are compared exactly.
      */
      const strip = (san: string) => san.replace(/[+#?!]+$/, '');
      const ours = decoded.map(strip);
      const theirs = expected.map(strip);
      if (ours.length !== theirs.length) {
        mismatches.push(`game ${row.ID}: ${ours.length} moves, expected ${theirs.length}`);
        continue;
      }
      for (let i = 0; i < ours.length; i += 1) {
        if (ours[i] !== theirs[i]) {
          mismatches.push(
            `game ${row.ID} ply ${i + 1}: decoded ${ours[i]}, En Croissant says ${theirs[i]}`,
          );
          break;
        }
      }
    }

    expect(mismatches).toEqual([]);
    // Guards against the corpus silently emptying and the assertion above
    // passing because nothing was compared.
    expect(moves).toBeGreaterThan(4_000);
  });

  it('keeps comments with the move they follow', { timeout: 60_000 }, () => {
    const withEval = games
      .map((row) => decodeMoves(new Uint8Array(row.Moves), (row.FEN ?? undefined) as Fen))
      .filter((result) => result.ok)
      .flatMap((result) => (result.ok ? result.moves : []))
      .filter((move) => move.comments.length > 0);

    expect(withEval.length).toBeGreaterThan(100);
    // Broadcast games carry clock and evaluation annotations; they are what a
    // reader loses if comments are dropped on import.
    expect(withEval.some((move) => /%clk|%eval/.test(move.comments.join(' ')))).toBe(true);
  });

  it('refuses a move index that no legal move can satisfy', () => {
    // 200 is a legal *byte* and never a legal move index from the start.
    const result = decodeMoves(new Uint8Array([200]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/past the \d+ legal moves/);
  });

  it('reports how far it got when a game is truncated mid-comment', () => {
    // A move, then a comment marker whose length bytes are missing.
    const result = decodeMoves(new Uint8Array([12, 253]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.decoded).toBe(1);
      expect(result.reason).toMatch(/ran past the end/);
    }
  });
});
