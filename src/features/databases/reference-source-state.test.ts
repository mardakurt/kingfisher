import { describe, expect, it } from 'vitest';

import type { ReferenceSource } from '@/reference/types';

import { badgeForSource, stateOf } from './reference-source-state';

const source = (over: Partial<ReferenceSource> = {}): ReferenceSource => ({
  id: 'kingfisher-elite-otb',
  name: 'Elite OTB',
  description: 'desc',
  kind: 'catalog',
  state: 'available',
  license: { id: 'CC-BY-SA-4.0', name: 'CC BY-SA 4.0', url: 'https://example.test/' },
  capabilities: [],
  installed: false,
  enabled: false,
  updateAvailable: false,
  offline: false,
  size: 0,
  ...over,
});

describe('reference source state', () => {
  it('reports not-installed for catalog rows that have not been touched', () => {
    expect(stateOf(source())).toBe('available-online');
  });

  it('reports installed for ready sources', () => {
    expect(stateOf(source({ installed: true, state: 'ready' }))).toBe('installed');
  });

  it('reports update-available when an installed source has a newer version', () => {
    expect(stateOf(source({ installed: true, state: 'ready', updateAvailable: true }))).toBe(
      'update-available',
    );
  });

  it('reports failed when an installed source has an error', () => {
    expect(stateOf(source({ installed: true, state: 'unavailable' }))).toBe('failed');
  });

  it('returns the right tone per state', () => {
    expect(badgeForSource(source())).toMatchObject({
      label: 'Available online',
      tone: 'accent',
    });
    expect(badgeForSource(source({ installed: true, state: 'ready' }))).toMatchObject({
      label: 'Installed',
      tone: 'positive',
    });
    expect(
      badgeForSource(source({ installed: true, state: 'ready', updateAvailable: true })),
    ).toMatchObject({ tone: 'warning' });
    expect(badgeForSource(source({ installed: true, state: 'unavailable' }))).toMatchObject({
      tone: 'danger',
    });
  });
});
