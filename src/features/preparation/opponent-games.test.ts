import { describe, expect, it } from 'vitest';

import { sourceShares } from './opponent-games';

describe('sourceShares', () => {
  it('counts each source in the games the report keeps, beside what it offered', () => {
    const origin = new Map([
      ['a', 'pack'],
      ['b', 'pack'],
      ['c', 'pack'],
      ['d', 'local'],
    ]);
    const offered = [
      { id: 'local', name: 'My games', found: 1 },
      { id: 'pack', name: 'Kingfisher Starter Reference', found: 3 },
    ];
    // The newest two were kept: one of each.
    expect(sourceShares([{ fingerprint: 'd' }, { fingerprint: 'a' }], origin, offered)).toEqual([
      { id: 'local', name: 'My games', found: 1, games: 1 },
      { id: 'pack', name: 'Kingfisher Starter Reference', found: 3, games: 1 },
    ]);
  });

  it('keeps a source whose games were all older than the limit, at zero', () => {
    const shares = sourceShares(
      [{ fingerprint: 'a' }],
      new Map([
        ['a', 'pack'],
        ['z', 'local'],
      ]),
      [
        { id: 'local', name: 'My games', found: 1 },
        { id: 'pack', name: 'Pack', found: 1 },
      ],
    );
    expect(shares.find((share) => share.id === 'local')).toMatchObject({ games: 0, found: 1 });
  });
});
