import { describe, expect, it } from 'vitest';

import {
  chooseTablebaseProvider,
  CompanionTablebaseProvider,
  EMPTY_STATUS,
  type LocalTablebaseStatus,
} from './companion';
import type { TablebaseProvider } from './types';

const remote = { id: 'lichess', name: 'Lichess Syzygy', maxPieces: 7 } as TablebaseProvider;

const status = (over: Partial<LocalTablebaseStatus> = {}): LocalTablebaseStatus => ({
  ...EMPTY_STATUS,
  ...over,
});

describe('choosing where a tablebase answer comes from', () => {
  const local = new CompanionTablebaseProvider();

  it('prefers local tables when they can actually answer', () => {
    const choice = chooseTablebaseProvider(
      5,
      local,
      remote,
      status({ configured: true, exists: true, maxPieces: 6, canProbe: true }),
    );

    expect(choice?.local).toBe(true);
    expect(choice?.provider.id).toBe('companion-syzygy');
    expect(choice?.reason).toContain('local tables on this machine');
  });

  it('falls back when the position is bigger than the local tables', () => {
    const choice = chooseTablebaseProvider(
      7,
      local,
      remote,
      status({ configured: true, exists: true, maxPieces: 5, canProbe: true }),
    );

    expect(choice?.local).toBe(false);
    // The reason names both numbers, so the user can see why rather than
    // wondering whether their tables are broken.
    expect(choice?.reason).toContain('5 pieces');
    expect(choice?.reason).toContain('7');
  });

  it('says plainly when tables exist but nothing can read them', () => {
    const choice = chooseTablebaseProvider(
      4,
      local,
      remote,
      status({ configured: true, exists: true, maxPieces: 6, canProbe: false }),
    );

    expect(choice?.local).toBe(false);
    /*
      The configuration users most often arrive at: files downloaded, no probe
      server running. Silently using the network here would leave them
      believing their local setup works.
    */
    expect(choice?.reason).toContain('no local probe server');
  });

  it('uses the remote provider without comment when nothing local is configured', () => {
    const choice = chooseTablebaseProvider(5, local, remote, EMPTY_STATUS);
    expect(choice?.local).toBe(false);
    expect(choice?.reason).toBe('Answered by Lichess Syzygy.');
  });

  it('declines entirely for a position no tablebase covers', () => {
    expect(chooseTablebaseProvider(12, local, remote, EMPTY_STATUS)).toBeNull();
    expect(chooseTablebaseProvider(1, local, remote, EMPTY_STATUS)).toBeNull();
  });
});

describe('the local provider’s own limit', () => {
  it('reports zero until a probe server exists, so eligibility refuses early', () => {
    const provider = new CompanionTablebaseProvider(
      status({ configured: true, exists: true, maxPieces: 6, canProbe: false }),
    );
    // Files on disk are not an ability to answer.
    expect(provider.maxPieces).toBe(0);

    const usable = new CompanionTablebaseProvider(
      status({ configured: true, exists: true, maxPieces: 6, canProbe: true }),
    );
    expect(usable.maxPieces).toBe(6);
  });
});
