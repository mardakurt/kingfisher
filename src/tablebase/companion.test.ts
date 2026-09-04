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
    expect(choice?.reason).toContain('Syzygy files on this machine');
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
      Silently using the network here would leave a user believing their local
      setup works. The message has to name a fix, and which fix depends on why:
      these four cases all look identical to somebody watching the board.
    */
    expect(choice?.reason).toContain('nothing on this machine can read them');
  });

  it('distinguishes the four ways local probing can be unavailable', () => {
    const answered = (extra: Parameters<typeof status>[0]) =>
      chooseTablebaseProvider(4, local, remote, status(extra))?.reason ?? '';

    expect(
      answered({
        configured: true,
        exists: true,
        maxPieces: 6,
        canProbe: false,
        helper: { built: false, running: false, largest: 0, restarts: 0 },
      }),
    ).toContain('tablebase:install');

    expect(
      answered({
        configured: true,
        exists: true,
        maxPieces: 6,
        canProbe: false,
        helper: { built: true, running: false, largest: 0, restarts: 3, reason: 'It crashed.' },
      }),
    ).toContain('It crashed.');

    expect(answered({ configured: true, exists: false, maxPieces: 0, canProbe: false })).toContain(
      'could not be read',
    );

    expect(answered({ configured: true, exists: true, maxPieces: 0, canProbe: false })).toContain(
      'no readable Syzygy tables',
    );
  });

  it('answers from what the helper opened, not from what is on disk', () => {
    /*
      Six-piece files present, but the helper only opened five. The limit that
      matters is the one that will answer the probe, and a six-piece position
      must go to the network rather than to a table nothing can read.
    */
    const partial = status({
      configured: true,
      exists: true,
      maxPieces: 6,
      canProbe: true,
      probeLimit: 5,
      prober: 'helper',
    });
    expect(chooseTablebaseProvider(5, local, remote, partial)?.local).toBe(true);
    expect(chooseTablebaseProvider(6, local, remote, partial)?.local).toBe(false);
  });

  it('names the external server when that is what is answering', () => {
    const reason =
      chooseTablebaseProvider(
        4,
        local,
        remote,
        status({
          configured: true,
          exists: true,
          maxPieces: 5,
          canProbe: true,
          probeLimit: 5,
          prober: 'server',
        }),
      )?.reason ?? '';
    expect(reason).toContain('tablebase server you are running');
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
