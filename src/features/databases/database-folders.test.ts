import { describe, expect, it } from 'vitest';

import type { SourceSetRecord } from '@/persistence/domain';

import { moveIntoFolder, placeCollections } from './database-folders';

const folder = (id: string, name: string, collectionIds: string[]): SourceSetRecord => ({
  id,
  name,
  kind: 'folder',
  collectionIds,
  createdAt: 1,
  updatedAt: 1,
});

const c = (id: string) => ({ id });

describe('placeCollections', () => {
  it('puts a collection in its folder and the rest at the top level, in order', () => {
    const placed = placeCollections(
      [c('local'), c('sqlite:a'), c('sqlite:b')],
      [folder('f1', 'Work', ['sqlite:b'])],
    );
    expect(placed.loose.map((x) => x.id)).toEqual(['local', 'sqlite:a']);
    expect(placed.inside.get('f1')?.map((x) => x.id)).toEqual(['sqlite:b']);
  });

  it('never shows a collection twice, nor one that no longer exists', () => {
    const placed = placeCollections(
      [c('sqlite:a')],
      [folder('f2', 'Zeta', ['sqlite:a']), folder('f1', 'Alpha', ['sqlite:a', 'sqlite:gone'])],
    );
    expect(placed.loose).toEqual([]);
    expect(placed.inside.get('f1')?.map((x) => x.id)).toEqual(['sqlite:a']);
    expect(placed.inside.get('f2')).toEqual([]);
  });
});

describe('moveIntoFolder', () => {
  const folders = [folder('f1', 'A', ['x']), folder('f2', 'B', [])];

  it('takes a collection out of its old folder and into the new one', () => {
    expect(moveIntoFolder(folders, 'x', 'f2')).toEqual([
      { id: 'f1', collectionIds: [] },
      { id: 'f2', collectionIds: ['x'] },
    ]);
  });

  it('back to the top level, and changes nothing that need not change', () => {
    expect(moveIntoFolder(folders, 'x', null)).toEqual([{ id: 'f1', collectionIds: [] }]);
    expect(moveIntoFolder(folders, 'x', 'f1')).toEqual([]);
  });
});
