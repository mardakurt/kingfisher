import { describe, expect, it } from 'vitest';

import { cp } from '@/chess/evaluation';
import { positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { asFen, asUci } from '@/chess/types';
import type {
  InboxDecisionRecord,
  RepertoirePositionRecord,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';

import { buildInbox, type InboxGame } from './inbox';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const position = (
  fen: string,
  depth: number,
  moves: readonly { uci: string; san: string; role?: 'main' | 'alternative' }[],
): RepertoirePositionRecord => ({
  id: `p-${depth}`,
  repertoireId: 'r1',
  positionKey: positionKey(fen) as never,
  fen: asFen(fen),
  sideToMove: fen.split(' ')[1] as 'w' | 'b',
  moves: moves.map((move) => ({
    uci: asUci(move.uci),
    san: move.san as never,
    role: move.role ?? 'main',
    updatedAt: 1,
  })),
  depth,
  createdAt: 1,
  updatedAt: 1,
  revision: 0,
});

// White: 1.e4, and after 1...e5, 2.Nf3.
const POSITIONS = [
  position(START, 0, [{ uci: 'e2e4', san: 'e4' }]),
  position(AFTER_E5, 2, [{ uci: 'g1f3', san: 'Nf3' }]),
];

const game = (id: string, pgn: string, myColor: 'w' | 'b' = 'w'): InboxGame => ({
  id,
  fingerprint: `fp-${id}`,
  title: `Game ${id}`,
  tree: parsePgn(pgn).games[0]!.tree,
  myColor,
});

const evidence = (key: string, analysedAt: number): StoredEngineEvidenceRecord => ({
  id: `${key}-${analysedAt}`,
  jobId: 'j',
  gameId: 'g',
  nodeId: 'n',
  positionKey: key as never,
  fen: asFen(`${key} 0 1`),
  engineId: 'sf',
  engineName: 'Stockfish',
  score: cp(20),
  depth: 20,
  nodes: 1,
  timeMs: 1,
  pv: [],
  analysedAt,
});

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

const base = {
  repertoireId: 'r1',
  color: 'w' as const,
  positions: POSITIONS,
  gaps: [],
  evidenceAt: () => [],
  decisions: [] as InboxDecisionRecord[],
  now: NOW,
  minimumPlies: 1,
};

describe('the repertoire inbox', () => {
  it('groups your own departures and the surprises, from your games with that colour', () => {
    const items = buildInbox({
      ...base,
      myGames: [
        game('a', '1. e4 e5 2. Bc4 Nc6 *'),
        game('b', '1. e4 e5 2. Bc4 Nf6 *'),
        game('c', '1. e4 c5 2. Nf3 *'),
        // Played with Black: not about a White repertoire.
        game('d', '1. e4 e5 2. Bc4 Nc6 *', 'b'),
      ],
    });
    const own = items.find((item) => item.kind === 'own-departure')!;
    expect(own.title).toBe('2. Bc4 instead of Nf3');
    expect(own.count).toBe(2);
    expect(own.games.map((entry) => entry.id)).toEqual(['a', 'b']);
    const surprise = items.find((item) => item.kind === 'surprise')!;
    expect(surprise.title).toBe('1... c5 — not prepared');
    expect(surprise.count).toBe(1);
    expect(items.map((item) => item.kind)).toEqual(['own-departure', 'surprise']);
  });

  it('flags two main moves, old evidence (not missing evidence) and frequent unanswered branches', () => {
    const doubled = [
      position(START, 0, [
        { uci: 'e2e4', san: 'e4' },
        { uci: 'd2d4', san: 'd4' },
      ]),
      POSITIONS[1]!,
    ];
    const items = buildInbox({
      ...base,
      positions: doubled,
      myGames: [],
      evidenceAt: (key) =>
        key === positionKey(START)
          ? [evidence(key, NOW - 400 * DAY), evidence(key, NOW - 500 * DAY)]
          : key === positionKey(AFTER_E5)
            ? [evidence(key, NOW - 10 * DAY)]
            : [],
      gaps: [
        {
          positionKey: 'k1' as never,
          fen: asFen(START),
          opponentMove: { uci: 'c7c5', san: 'c5' } as never,
          games: 3,
          depth: 1,
        },
        {
          positionKey: 'k2' as never,
          fen: asFen(START),
          opponentMove: { uci: 'e7e6', san: 'e6' } as never,
          games: 2,
          depth: 1,
        },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(['conflict', 'branch', 'stale-evidence']);
    expect(items[0]!.title).toBe('1. d4 and e4 are both main');
    expect(items[1]!.detail).toContain('from My games, not from theory');
    expect(items[2]!.title).toBe('1. evaluated 400 days ago');
  });

  it('keeps a decision while the evidence is the same, and reopens on new evidence', () => {
    const games = [game('a', '1. e4 e5 2. Bc4 Nc6 *')];
    const first = buildInbox({ ...base, myGames: games })[0]!;
    const dismissed: InboxDecisionRecord = {
      id: first.id,
      repertoireId: 'r1',
      status: 'dismissed',
      reason: 'Blitz only',
      evidence: first.evidence,
      decidedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      revision: 0,
    };
    expect(buildInbox({ ...base, myGames: games, decisions: [dismissed] })[0]).toMatchObject({
      status: 'dismissed',
      reopened: false,
    });
    const more = [...games, game('b', '1. e4 e5 2. Bc4 Nf6 *')];
    expect(buildInbox({ ...base, myGames: more, decisions: [dismissed] })[0]).toMatchObject({
      status: 'open',
      reopened: true,
      decision: { reason: 'Blitz only' },
    });
    const snoozed = { ...dismissed, status: 'snoozed' as const, snoozedUntil: NOW + DAY };
    expect(buildInbox({ ...base, myGames: games, decisions: [snoozed] })[0]!.status).toBe(
      'snoozed',
    );
    expect(
      buildInbox({ ...base, myGames: games, decisions: [snoozed], now: NOW + 2 * DAY })[0],
    ).toMatchObject({ status: 'open', reopened: true });
  });

  it('gives the same items in the same order whatever order its inputs come in', () => {
    const games = [
      game('a', '1. e4 e5 2. Bc4 Nc6 *'),
      game('b', '1. e4 e5 2. Bc4 Nf6 *'),
      game('c', '1. e4 c5 2. Nf3 *'),
    ];
    const once = buildInbox({ ...base, myGames: games });
    const again = buildInbox({
      ...base,
      myGames: [...games].reverse(),
      positions: [...POSITIONS].reverse(),
    });
    expect(again).toEqual(once);
  });
});
