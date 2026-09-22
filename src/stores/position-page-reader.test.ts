import { describe, expect, it, vi } from 'vitest';
import { START_FEN, positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { asUci } from '@/chess/types';
import { normalizeGame, indexGame } from '@/persistence/prepare-game';
import { createMemoryRepositories } from '@/persistence/repositories';
import { positionIdentity } from '@/position/knowledge';
import {
  readKnowledge,
  readPositionEvidence,
  readPositionGames,
  positionStructureQuery,
} from './position-page-reader';

describe('reading position knowledge', () => {
  it('uses canonical keys and keeps source failures explicit', async () => {
    const identity = positionIdentity(START_FEN)!;
    expect(positionStructureQuery(identity, 'pawn-skeleton')).toMatchObject({
      positionKey: positionKey(START_FEN),
      pawnSkeleton: identity.pawnSkeleton,
      mode: 'pawn-skeleton',
    });
    expect(
      await readKnowledge(async () => {
        throw new Error('Unavailable');
      }),
    ).toEqual({ ok: false, message: 'Unavailable' });
    expect(await readKnowledge(async () => [])).toEqual({ ok: true, value: [] });
  });
  it('finds a game once and opens the position before the outgoing indexed move', async () => {
    const repositories = createMemoryRepositories();
    const parsed = parsePgn('[White "Ana"]\n[Black "Guest"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. e4 *')
      .games[0]!;
    const game = normalizeGame(parsed.tree);
    await repositories.games.persist(game, indexGame(game));
    const rows = await readPositionGames(repositories, positionIdentity(START_FEN)!, ['Ana']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.facts).toMatchObject({
      nodeId: game.tree.rootId,
      ply: 0,
      ownColor: 'w',
      nextMove: 'Nf3',
    });
  });
  it('retains pinned evidence when the queue fails, without running an engine', async () => {
    const repositories = createMemoryRepositories();
    await repositories.pinnedLines.pin({
      positionKey: positionKey(START_FEN),
      fen: START_FEN,
      engineId: 'recorded',
      engineName: 'Recorded engine',
      multiPv: 1,
      score: { kind: 'cp', cp: 24 },
      depth: 17,
      nodes: 12000,
      timeMs: 500,
      pvUci: [asUci('e2e4')],
      pvSan: [],
    });
    vi.spyOn(repositories.analysisQueue, 'evidenceForPosition').mockRejectedValue(
      new Error('Queue unreadable'),
    );
    const answer = await readPositionEvidence(repositories, positionKey(START_FEN));
    expect(answer.queued).toEqual({ ok: false, message: 'Queue unreadable' });
    expect(answer.pinned.ok && answer.pinned.value[0]?.depth).toBe(17);
  });
});
