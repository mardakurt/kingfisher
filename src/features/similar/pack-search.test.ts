import { describe, expect, it } from 'vitest';

import type { PackReader } from '@/reference/reader';
import type { PackGame, PackManifest, PackPosition } from '@/reference/pack';

import { packCanAnswer, packLimitation, searchPacks } from './pack-search';

const game = (id: string): PackGame => ({
  id,
  white: 'Carlsen, M',
  black: 'Nepomniachtchi, I',
  result: '1-0',
  year: 2026,
  date: '2026.02.02',
  event: 'Wijk aan Zee',
  eco: 'B90',
  opening: 'Sicilian',
  whiteElo: 2830,
  blackElo: 2795,
  url: '',
  moves: 'e4 c5 Nf3 d6',
});

function reader(
  id: string,
  name: string,
  positions: Record<string, readonly string[]>,
): PackReader {
  return {
    manifest: {
      id,
      name,
      counts: { games: 1000, openable: 200, positions: 10, players: 5 },
    } as PackManifest,
    async position(key: string): Promise<PackPosition | null> {
      const games = positions[key];
      return games ? { key, moves: [], games } : null;
    },
    async games(ids: readonly string[]) {
      return ids.map((entry) => game(entry));
    },
  } as unknown as PackReader;
}

describe('what a pack can be asked', () => {
  it('answers the exact position and nothing else', () => {
    expect(packCanAnswer('exact-position')).toBe(true);
    expect(packCanAnswer('pawn-skeleton')).toBe(false);
    expect(packCanAnswer('signature')).toBe(false);
    expect(packCanAnswer('claims')).toBe(false);
  });

  it('says why, in the words the page prints', () => {
    expect(packLimitation('pawn-skeleton', 'Elite OTB')).toContain('the same pawn skeleton');
    expect(packLimitation('pawn-skeleton', 'Elite OTB')).toContain('not structures');
    expect(packLimitation('signature', 'Elite OTB')).toContain('structural features');
  });
});

describe('searchPacks', () => {
  const packs = [reader('a', 'Elite OTB', { 'pos-1': ['g1', 'g2'] }), reader('b', 'Starter', {})];

  it('returns each pack’s own games, never merged', async () => {
    const answers = await searchPacks(packs, 'exact-position', 'pos-1');
    expect(answers.map((answer) => answer.packName)).toEqual(['Elite OTB', 'Starter']);
    expect(answers[0]!.matches.map((match) => match.game.id)).toEqual(['g1', 'g2']);
    // A pack that never saw the position answers with none, which is an answer.
    expect(answers[1]!.matches).toEqual([]);
    expect(answers[1]!.unanswerable).toBeUndefined();
  });

  it('caps what it reads from any one pack', async () => {
    const many = reader('c', 'Big', { 'pos-1': Array.from({ length: 50 }, (_v, i) => `g${i}`) });
    const answers = await searchPacks([many], 'exact-position', 'pos-1', 5);
    expect(answers[0]!.matches).toHaveLength(5);
  });

  it('reports the modes a pack cannot answer instead of answering empty', async () => {
    const answers = await searchPacks(packs, 'pawn-skeleton', 'pos-1');
    expect(answers[0]!.matches).toEqual([]);
    expect(answers[0]!.unanswerable).toContain('Elite OTB');
    expect(answers[0]!.openable).toBe(200);
  });
});
