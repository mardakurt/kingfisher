import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { asFen, asSan, asUci } from '@/chess/types';
import { createMemoryRepositories } from '@/persistence/repositories';
import { canonicalise, searchByPosition } from './position-search';

const KEY = positionKey(START_FEN);

describe('reading a pasted position', () => {
  it('accepts a FEN and reduces it to its canonical key', () => {
    expect(canonicalise(START_FEN)).toBe(KEY);
    // Move counters cannot change which position this is, which is exactly
    // what a player pasting from elsewhere needs.
    expect(canonicalise('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 34')).toBe(KEY);
  });

  it('accepts a canonical key unchanged', () => {
    expect(canonicalise(KEY)).toBe(KEY);
    expect(canonicalise(`  ${KEY}  `)).toBe(KEY);
  });

  it('refuses something that is not a position at all', () => {
    expect(canonicalise('')).toBeNull();
    expect(canonicalise('the najdorf')).toBeNull();
    // An illegal FEN is rejected rather than turned into a key that matches
    // nothing and reads as an empty result.
    expect(canonicalise('xxxx/8/8/8/8/8/8/8 w - - 0 1')).toBeNull();
  });
});

describe('finding a position across the workspace', () => {
  it('says the input was unreadable rather than returning nothing', async () => {
    const result = await searchByPosition(createMemoryRepositories(), 'not a position');
    expect(result.unreadable).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it('finds the position in every kind of record that holds it', async () => {
    const repositories = createMemoryRepositories();

    await repositories.endgames.create({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      title: 'A saved endgame',
      category: 'rook',
      goal: 'study',
    });
    const file = await repositories.openingFiles.create({ name: 'Najdorf', color: 'b' });
    await repositories.openingFiles.addPosition(file.id, file.revision, {
      positionKey: KEY,
      fen: START_FEN,
      line: [asSan('e4')],
    });
    await repositories.review.createDecision({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      plan: 'Improve the knight',
    });
    await repositories.training.create({
      mode: 'best-move',
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      prompt: 'Find the move',
      solutionUci: [asUci('e2e4')],
      solutionSan: [asSan('e4')],
      candidatesUci: [],
      plans: [],
      tags: [],
    });
    const session = await repositories.preparation.create({ title: 'Round 6', myColor: 'w' });
    await repositories.preparation.addSheetCard(session.id, session.revision, {
      positionKey: KEY,
      fen: START_FEN,
      line: [],
    });

    const result = await searchByPosition(repositories, START_FEN);
    const kinds = new Set(result.hits.map((hit) => hit.kind));

    expect(result.unreadable).toBe(false);
    expect(result.positionKey).toBe(KEY);
    expect(kinds).toContain('endgame');
    expect(kinds).toContain('opening-file');
    expect(kinds).toContain('decision');
    expect(kinds).toContain('training');
    expect(kinds).toContain('preparation');
    // Every hit can be opened.
    for (const hit of result.hits) expect(hit.targetId).toBeTruthy();
  });

  it('finds nothing for a position nothing refers to', async () => {
    const repositories = createMemoryRepositories();
    await repositories.endgames.create({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      title: 'A saved endgame',
      category: 'rook',
      goal: 'study',
    });

    const elsewhere = asFen('7k/8/8/8/8/8/8/R6K w - - 0 1');
    const result = await searchByPosition(repositories, elsewhere);
    expect(result.unreadable).toBe(false);
    expect(result.hits).toEqual([]);
  });

  it('matches a position whose FEN differs only in its counters', async () => {
    const repositories = createMemoryRepositories();
    await repositories.endgames.create({
      positionKey: KEY,
      fen: START_FEN,
      sideToMove: 'w',
      title: 'Stored under the canonical key',
      category: 'pawn',
      goal: 'study',
    });

    const result = await searchByPosition(
      repositories,
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 99 250',
    );
    expect(result.hits.map((hit) => hit.kind)).toContain('endgame');
  });
});
