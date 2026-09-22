import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import type {
  EndgamePositionRecord,
  RepertoirePositionRecord,
  RepertoireRecord,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import type { GameRecord, PositionRecord } from '@/persistence/types';

import { buildRecurringReport } from './recurring';

const NOW = Date.parse('2026-09-22T12:00:00Z');

function game(id: string, result: '1-0' | '0-1' | '1/2-1/2', player = 'Player'): GameRecord {
  const parsed = parsePgn(`[Event "Recurring facts"]
[Site "Club"]
[Date "2026.09.20"]
[Round "${id}"]
[White "${player}"]
[Black "Opponent ${id}"]
[Result "${result}"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 ${result}`);
  const tree = parsed.games[0]?.tree;
  if (!tree) throw new Error(parsed.issues.map((issue) => issue.message).join('; '));
  return { ...normalizeGame(tree, NOW), id, fingerprint: `fp-${id}` };
}

function evidence(
  gameRecord: GameRecord,
  nodeIndex: number,
  score: number,
  analysedAt: number,
  overrides: Partial<StoredEngineEvidenceRecord> = {},
): StoredEngineEvidenceRecord {
  const nodeId = mainlinePath(gameRecord.tree)[nodeIndex]!;
  const node = gameRecord.tree.nodes[nodeId]!;
  return {
    id: `${gameRecord.id}|${nodeId}|${analysedAt}`,
    jobId: `job-${gameRecord.id}`,
    gameId: gameRecord.id,
    nodeId,
    positionKey: indexGame(gameRecord)[nodeIndex]?.positionKey ?? 'final',
    fen: node.fen,
    engineId: 'stockfish-wasm',
    engineName: 'Stockfish',
    score: cp(score),
    depth: 18,
    nodes: 10_000,
    timeMs: 500,
    pv: [],
    analysedAt,
    ...overrides,
  };
}

function repertoire(
  position: PositionRecord,
  color: 'w' | 'b' = 'w',
): { repertoire: RepertoireRecord; position: RepertoirePositionRecord } {
  return {
    repertoire: {
      id: `rep-${color}`,
      title: `${color === 'w' ? 'White' : 'Black'} repertoire`,
      color,
      createdAt: NOW,
      updatedAt: NOW,
    },
    position: {
      id: `rep-position-${color}`,
      repertoireId: `rep-${color}`,
      positionKey: position.positionKey,
      fen: position.fen!,
      sideToMove: position.mover,
      moves: [],
      depth: position.ply - 1,
      createdAt: NOW,
      updatedAt: NOW,
      revision: 1,
    },
  };
}

function endgame(position: PositionRecord): EndgamePositionRecord {
  return {
    id: 'endgame-1',
    positionKey: position.positionKey,
    fen: position.fen!,
    sideToMove: position.mover,
    title: 'Saved rook ending',
    category: 'rook',
    goal: 'study',
    tags: [],
    pieceCount: 32,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
  };
}

describe('recurring facts', () => {
  it('includes an exact 100 cp loss, excludes 99 cp, and signs Black correctly', () => {
    const white = game('white', '0-1');
    const black = game('black', '1-0', 'Opponent');
    const blackAsPlayer = {
      ...black,
      black: 'Player',
      blackKey: 'player',
      playerKeys: [black.whiteKey, 'player'],
    };
    const report = buildRecurringReport({
      games: [white, blackAsPlayer],
      aliases: [' Player '],
      evidence: [
        evidence(white, 2, 40, 1),
        evidence(white, 3, -60, 2),
        evidence(white, 4, 30, 3),
        evidence(white, 5, -69, 4),
        evidence(blackAsPlayer, 1, -20, 5),
        evidence(blackAsPlayer, 2, 80, 6),
      ],
      positions: [],
      endgames: [],
      repertoires: [],
      repertoirePositions: [],
      engineLossCp: 100,
    });

    expect(report.engine.flatMap((row) => row.occurrences)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gameId: 'white', lossCp: 100, moveSan: 'Nf3' }),
        expect.objectContaining({ gameId: 'black', lossCp: 100, moveSan: 'e5' }),
      ]),
    );
    expect(report.engine.flatMap((row) => row.occurrences)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ lossCp: 99 })]),
    );
  });

  it('pairs only evidence from the same job and engine and keeps the latest pair', () => {
    const stored = game('g1', '0-1');
    const report = buildRecurringReport({
      games: [stored],
      aliases: ['Player'],
      evidence: [
        evidence(stored, 2, 80, 1, { jobId: 'old' }),
        evidence(stored, 3, -120, 2, { jobId: 'old' }),
        evidence(stored, 2, 40, 10, { jobId: 'new' }),
        evidence(stored, 3, -60, 11, { jobId: 'new' }),
        evidence(stored, 3, -500, 12, { jobId: 'other-job' }),
      ],
      positions: [],
      endgames: [],
      repertoires: [],
      repertoirePositions: [],
    });

    expect(report.engine).toHaveLength(1);
    expect(report.engine[0]!.occurrences[0]).toMatchObject({ before: '+0.4', after: '-0.6' });
  });

  it('requires five unique games and a below-50% record for a pawn structure', () => {
    const games = [
      game('g1', '1-0'),
      game('g2', '0-1'),
      game('g3', '0-1'),
      game('g4', '0-1'),
      game('g5', '0-1'),
    ];
    const positions = games.flatMap(indexGame);
    const repeated = positions.find((position) => position.gameId === 'g1')!;
    const report = buildRecurringReport({
      games,
      aliases: ['Player'],
      evidence: [],
      positions: [...positions, { ...repeated, id: `${repeated.id}-duplicate`, ply: 99 }],
      endgames: [],
      repertoires: [],
      repertoirePositions: [],
    });

    expect(report.structures.length).toBeGreaterThan(0);
    expect(report.structures[0]).toMatchObject({ wins: 1, losses: 4, draws: 0, scorePercent: 20 });
    expect(report.structures[0]!.games).toHaveLength(5);
    expect(
      buildRecurringReport({
        games: games.slice(0, 4),
        aliases: ['Player'],
        evidence: [],
        positions: positions.filter((position) => position.gameId !== 'g5'),
        endgames: [],
        repertoires: [],
        repertoirePositions: [],
      }).structures,
    ).toHaveLength(0);
  });

  it('joins endgames and repertoire through canonical positions without duplicate games', () => {
    const games = [game('loss', '0-1'), game('win', '1-0')];
    const positions = games.flatMap(indexGame);
    const target = positions.find((position) => position.gameId === 'loss' && position.ply === 3)!;
    const matching = positions.filter((position) => position.positionKey === target.positionKey);
    const savedEndgame = endgame(target);
    const savedRepertoire = repertoire(target);
    const report = buildRecurringReport({
      games,
      aliases: ['Player'],
      evidence: [],
      positions: [
        ...matching.filter((position) => position.gameId === 'loss'),
        { ...matching[0]!, id: 'duplicate', ply: 90 },
      ],
      endgames: [savedEndgame],
      repertoires: [savedRepertoire.repertoire, repertoire(target, 'b').repertoire],
      repertoirePositions: [savedRepertoire.position, repertoire(target, 'b').position],
    });

    expect(report.endgames).toEqual([
      expect.objectContaining({ category: 'rook', wins: 0, losses: 1, distinctPositions: 1 }),
    ]);
    expect(report.endgames[0]!.games).toHaveLength(1);
    expect(report.repertoire).toEqual([
      expect.objectContaining({
        positionKey: target.positionKey,
        repertoireTitles: ['White repertoire'],
        wins: 0,
        losses: 1,
      }),
    ]);
  });

  it('emits only rows whose W/L/D denominator is exact', () => {
    const games = Array.from({ length: 5 }, (_, index) =>
      game(`g${index}`, index === 0 ? '1-0' : '0-1'),
    );
    const positions = games.flatMap(indexGame);
    const report = buildRecurringReport({
      games,
      aliases: ['Player'],
      evidence: [],
      positions,
      endgames: [endgame(positions[0]!)],
      repertoires: [],
      repertoirePositions: [],
    });

    for (const row of [
      ...report.engine,
      ...report.structures,
      ...report.endgames,
      ...report.repertoire,
    ]) {
      expect(row.games.length).toBeGreaterThan(0);
      expect(row.wins + row.losses + row.draws).toBe(row.games.length);
      expect(new Set(row.games.map((entry) => entry.gameId)).size).toBe(row.games.length);
    }
    expect(report.factCount).toBe(
      report.engine.length +
        report.structures.length +
        report.endgames.length +
        report.repertoire.length,
    );
  });
});
