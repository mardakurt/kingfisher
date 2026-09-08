/**
 * The port is a property of the profile.
 *
 * These are the assertions for the worst defect Phase 22 found: the shell took
 * a fresh free port every launch, a browser partitions storage by origin, an
 * origin includes the port, and so every quit and relaunch of the packaged
 * application handed the user an empty workspace. Every study, repertoire, note
 * and preference, on every restart.
 *
 * The tests below are deliberately about the *decision* rather than about
 * Electron. Whether Chromium keys IndexedDB by origin is not in doubt and is
 * not this file's to prove; `scripts/desktop-restart.mjs` proves the whole
 * thing end to end in the packaged application, by writing a study, quitting,
 * reopening and reading it back.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  PORT_BAND,
  PortUnavailableError,
  adoptedPort,
  preferredPort,
  resolveAppPort,
} from './origin.mjs';

const profile = () => mkdtempSync(path.join(tmpdir(), 'kingfisher-origin-'));

/** A `portFree` that says yes to exactly these ports. */
const allow = (...ports) => {
  const open = new Set(ports);
  return async (_host, port) => open.has(port);
};

const idb = (userData, port, at) => {
  const directory = path.join(userData, 'IndexedDB', `http_127.0.0.1_${port}.indexeddb.leveldb`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'CURRENT'), 'x');
  if (at !== undefined) utimesSync(directory, at / 1000, at / 1000);
};

describe('choosing the port a profile is served on', () => {
  it('takes the port its own path prefers, on a fresh profile', async () => {
    const userData = profile();
    const port = await resolveAppPort(userData, allow(preferredPort(userData)));
    expect(port).toBe(preferredPort(userData));
  });

  it('steps on when that one is held by something else', async () => {
    const userData = profile();
    const next = PORT_BAND.first + ((preferredPort(userData) - PORT_BAND.first + 2) % 90);
    const port = await resolveAppPort(userData, allow(next));
    expect(port).toBe(next);
  });

  /**
   * The reason the starting point is derived rather than fixed.
   *
   * A checkout shell and a packaged application are two profiles on one
   * machine. If both scanned from the same entry while the other was not
   * running, both would record it and then refuse to run together — turning a
   * data-safety rule into an inability to open two Kingfishers.
   */
  it('spreads different profiles across the band', () => {
    const ports = new Set(Array.from({ length: 40 }, () => preferredPort(profile())));
    expect(ports.size, 'forty profiles should not share one preferred port').toBeGreaterThan(20);
    for (const port of ports) {
      expect(port).toBeGreaterThanOrEqual(PORT_BAND.first);
      expect(port).toBeLessThanOrEqual(PORT_BAND.last);
    }
  });

  it('is the same answer every time for one profile', () => {
    const userData = profile();
    expect(preferredPort(userData)).toBe(preferredPort(userData));
  });

  /**
   * The whole point. Two launches, one profile, one port.
   */
  it('gives the same port back on every later launch', async () => {
    const userData = profile();
    const mine = preferredPort(userData);
    const first = await resolveAppPort(userData, allow(mine));
    // Another port is free too — the exact situation that used to move the
    // origin, and with it every study the profile held.
    const second = await resolveAppPort(
      userData,
      allow(mine, mine === PORT_BAND.last ? PORT_BAND.first : mine + 1),
    );
    expect(second, 'the profile must be served where its data is').toBe(first);
  });

  it('writes the decision down beside the data it addresses', async () => {
    const userData = profile();
    const port = await resolveAppPort(userData, allow(preferredPort(userData)));
    const record = JSON.parse(readFileSync(path.join(userData, 'origin.json'), 'utf8'));
    expect(record.port).toBe(port);
  });

  /**
   * Failing here is the design, not a gap in it.
   *
   * The alternative is silently taking a different port, which is the defect
   * this whole file replaces: a person would reopen Kingfisher to an empty
   * workspace and no explanation. A message naming the port is recoverable;
   * an empty workspace is not obviously recoverable at all.
   */
  it('refuses to start elsewhere when its own port is taken', async () => {
    const userData = profile();
    const mine = preferredPort(userData);
    await resolveAppPort(userData, allow(mine));

    const other = mine === PORT_BAND.last ? PORT_BAND.first : mine + 1;
    const failure = await resolveAppPort(userData, allow(other)).catch((error) => error);
    expect(failure).toBeInstanceOf(PortUnavailableError);
    expect(failure.port).toBe(mine);
    expect(failure.message).toContain('still there');
    expect(failure.message).toContain(String(mine));
  });
});

describe('adopting a profile written before any of this existed', () => {
  it('finds nothing in an empty profile', () => {
    expect(adoptedPort(profile())).toBeNull();
  });

  it('takes the origin that was written to most recently', () => {
    const userData = profile();
    idb(userData, 51000, Date.now() - 500_000);
    idb(userData, 52000, Date.now() - 10_000);
    idb(userData, 53000, Date.now() - 300_000);
    expect(adoptedPort(userData)).toBe(52000);
  });

  it('ignores anything that is not an origin directory', () => {
    const userData = profile();
    mkdirSync(path.join(userData, 'IndexedDB', 'chrome-extension_abc.indexeddb.leveldb'), {
      recursive: true,
    });
    expect(adoptedPort(userData)).toBeNull();
  });

  /**
   * A profile from rc.1 or rc.2 has its work at whatever port that launch
   * happened to get and no record of it. Stranding it would turn one data-loss
   * bug into a second one.
   */
  it('serves an older profile at the port its work is actually at', async () => {
    const userData = profile();
    idb(userData, 56531, Date.now() - 60_000);
    const port = await resolveAppPort(userData, allow(56531, preferredPort(userData)));
    expect(port).toBe(56531);
  });

  it('and refuses to start rather than abandoning it, if that port is taken', async () => {
    const userData = profile();
    idb(userData, 56531, Date.now() - 60_000);
    const failure = await resolveAppPort(userData, allow(preferredPort(userData))).catch(
      (error) => error,
    );
    expect(failure).toBeInstanceOf(PortUnavailableError);
    expect(failure.port).toBe(56531);
  });
});
