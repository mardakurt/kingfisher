import { beforeEach, describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import {
  pawnSkeletonKey,
  structureClaims,
  structureFacts,
  structureSignature,
} from '@/chess/structure';
import { positionKey } from '@/chess/fen';
import { mainlinePath, mustGetNode } from '@/chess/tree/tree';

import { indexGame, normalizeGame } from '../prepare-game';
import { createMemoryRepositories } from '.';
import type { AppRepositories } from '../types';

let repositories: AppRepositories;

const game = (pgn: string) => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree, 1);
};

beforeEach(() => {
  repositories = createMemoryRepositories();
});

describe('deterministic structure search', () => {
  it('finds the same pawn skeleton with different pieces and ranks facts transparently', async () => {
    const first = game(
      '[White "One"]\n[Black "A"]\n[WhiteElo "2600"]\n[Date "2025.01.01"]\n\n1. Nf3 Nf6 2. d4 d5 3. c4 e6 4. Nc3 *',
    );
    const second = game(
      '[White "Two"]\n[Black "B"]\n[WhiteElo "2500"]\n[Date "2026.01.01"]\n\n1. d4 d5 2. c4 e6 3. Nh3 Nf6 4. Nc3 *',
    );
    await repositories.games.persist(first, indexGame(first));
    await repositories.games.persist(second, indexGame(second));

    const node = mustGetNode(first.tree, mainlinePath(first.tree)[6]!);
    const facts = structureFacts(node.fen)!;
    const query = {
      positionKey: positionKey(node.fen),
      pawnSkeleton: pawnSkeletonKey(node.fen),
      structureSignature: structureSignature(facts),
      claims: structureClaims(facts).map((claim) => claim.id),
    };

    const skeleton = await repositories.games.searchStructures({
      ...query,
      mode: 'pawn-skeleton',
    });
    expect(new Set(skeleton.map((row) => row.game.white))).toEqual(new Set(['One', 'Two']));
    expect(skeleton.filter((row) => row.exactPosition)).toHaveLength(1);
    expect(skeleton.every((row) => row.samePawnSkeleton)).toBe(true);

    const byRating = await repositories.games.searchStructures({
      ...query,
      mode: 'pawn-skeleton',
      sort: 'rating',
    });
    expect(byRating[0]?.game.white).toBe('One');
  });

  it('requires every selected claim rather than treating filters as alternatives', async () => {
    const stored = game('[White "IQP"]\n[Black "B"]\n\n1. d4 d5 2. c4 e6 3. cxd5 exd5 4. Nc3 *');
    await repositories.games.persist(stored, indexGame(stored));
    const positions = indexGame(stored);
    const target = positions.find((entry) => (entry.structureClaims?.length ?? 0) >= 2)!;
    const claims = target.structureClaims!.slice(0, 2);

    const rows = await repositories.games.searchStructures({
      mode: 'claims',
      positionKey: target.positionKey,
      pawnSkeleton: target.pawnSkeleton!,
      structureSignature: target.structureSignature!,
      claims,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((row) => claims.every((claim) => row.position.structureClaims?.includes(claim))),
    ).toBe(true);
  });
});
