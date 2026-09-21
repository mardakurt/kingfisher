import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn/parse';
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

describe('finding a position in studies and team hand-ins, and its structure elsewhere', () => {
  const tree = (pgn: string) => {
    const game = parsePgn(pgn).games[0];
    if (!game) throw new Error('no game');
    return game.tree;
  };
  // After 1.e4 e5 2.Nf3: the position the search is for.
  const target = asFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');

  it('finds the position in a chapter sideline and in a hand-in, with where it is', async () => {
    const repositories = createMemoryRepositories();
    const study = await repositories.studies.create({ title: 'Open games' });
    // The main line goes elsewhere; the position is only in the variation.
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Petroff or not',
      tree: tree('1. e4 e5 2. Nc3 (2. Nf3 Nf6) Nf6 *'),
    });
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Queen pawn',
      tree: tree('1. d4 d5 *'),
    });
    const team = await repositories.team.createTeam({
      name: 'Academy',
      members: [{ name: 'Ana', role: 'student' }],
      meIndex: 0,
    });
    const assignment = await repositories.team.createAssignment({
      teamId: team.id,
      title: 'Round 3 game',
      kind: 'game',
      brief: '',
      setBy: team.members[0]!.id,
    });
    await repositories.team.addHandover(assignment.id, assignment.revision, {
      kind: 'hand-in',
      authorId: team.members[0]!.id,
      note: 'Done.',
      pgn: '1. e4 e5 2. Nf3 Nc6 *',
    });

    const result = await searchByPosition(repositories, target);
    const chapter = result.hits.find((hit) => hit.kind === 'chapter');
    expect(chapter).toMatchObject({
      title: 'Open games · Petroff or not',
      subtitle: 'at 2.Nf3',
      parentId: study.id,
      ply: 3,
    });
    expect(chapter?.nodeId).toBeTruthy();
    expect(result.hits.filter((hit) => hit.kind === 'chapter')).toHaveLength(1);
    const handIn = result.hits.find((hit) => hit.kind === 'team');
    expect(handIn).toMatchObject({
      title: 'Academy · Round 3 game',
      subtitle: 'hand-in by Ana',
      targetId: assignment.id,
      parentId: team.id,
      ply: 3,
    });
  });

  it('reports work that holds the same pawn skeleton without the position', async () => {
    const repositories = createMemoryRepositories();
    const study = await repositories.studies.create({ title: 'Structures' });
    // 1.e4 e5 2.Bc4: the same pawns as after 2.Nf3, different pieces.
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Bishop first',
      tree: tree('1. e4 e5 2. Bc4 Nf6 *'),
    });
    await repositories.studies.createChapter({
      studyId: study.id,
      title: 'Exact',
      tree: tree('1. e4 e5 2. Nf3 *'),
    });
    const repertoire = await repositories.repertoires.create({ title: 'Italian', color: 'w' });
    const italian = asFen('rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2');
    await repositories.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: italian,
      sideToMove: 'b',
      depth: 3,
      moves: [],
    });

    const result = await searchByPosition(repositories, target);
    expect(result.pawnSkeleton).toBeTruthy();
    // The exact chapter is a hit, not a structure hit.
    expect(result.hits.map((hit) => hit.title)).toEqual(['Structures · Exact']);
    expect(result.structure.map((hit) => [hit.kind, hit.title, hit.subtitle])).toEqual([
      // The skeleton is there from 1…e5; 2.Bc4 only moves a piece.
      ['chapter', 'Structures · Bishop first', 'same pawns from 1…e5'],
      ['repertoire', 'Italian', 'same pawns at depth 3'],
    ]);
  });

  it('reads the skeleton from a bare key too, and reports nothing when nothing holds it', async () => {
    const result = await searchByPosition(createMemoryRepositories(), KEY);
    expect(result.pawnSkeleton).toBeTruthy();
    expect(result.structure).toEqual([]);
  });
});
