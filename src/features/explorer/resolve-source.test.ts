import { describe, expect, it } from 'vitest';

import type { ChessDatabaseProvider } from '@/database/types';

import { resolveExplorerSource } from './resolve-source';

const source = (id: string) => ({ id, name: id }) as unknown as ChessDatabaseProvider;
const builtIn = [source('lichess-masters'), source('lichess'), source('local')];
const settled = { references: false, companion: false };

describe('the explorer source before the registry is complete', () => {
  it('waits for the chosen pack while the packs are still being read, instead of answering from Masters', () => {
    const resolved = resolveExplorerSource(builtIn, 'kingfisher-starter', {
      references: true,
      companion: false,
    });
    expect(resolved).toEqual({ kind: 'waiting', preferredId: 'kingfisher-starter' });
  });

  it('takes the chosen pack the moment it registers', () => {
    const resolved = resolveExplorerSource(
      [source('kingfisher-starter'), ...builtIn],
      'kingfisher-starter',
      { references: true, companion: true },
    );
    expect(resolved.kind === 'ready' && resolved.provider.id).toBe('kingfisher-starter');
  });

  it('waits for a chosen companion collection only while the companion has not answered', () => {
    expect(
      resolveExplorerSource(builtIn, 'sqlite:mega', { references: false, companion: true }).kind,
    ).toBe('waiting');
    // Packs still loading do not hold up a companion choice, and vice versa.
    const resolved = resolveExplorerSource(builtIn, 'sqlite:mega', {
      references: true,
      companion: false,
    });
    expect(resolved.kind === 'ready' && resolved.provider.id).toBe('lichess-masters');
  });

  it('falls back to the first source only once nothing else could register the choice', () => {
    const resolved = resolveExplorerSource(builtIn, 'uninstalled-pack', settled);
    expect(resolved.kind === 'ready' && resolved.provider.id).toBe('lichess-masters');
    expect(resolveExplorerSource([], 'x', settled)).toEqual({ kind: 'none' });
  });
});
