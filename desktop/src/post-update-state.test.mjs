import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/*
  The "Kingfisher was updated to X" notice: shown after a real update, on
  every launch until dismissed, and never on a fresh profile's first launch
  — which the first version did, because "no acknowledged version" and
  "updated" were the same test. Real files in a temporary profile.
*/
const profiles = [];
async function load(version) {
  const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-update-state-'));
  profiles.push(profile);
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: { getVersion: () => version, getPath: () => profile, isQuitting: false },
    dialog: {},
  }));
  vi.doMock('./kingfisher-updater.mjs', () => ({
    on: () => () => {},
    isUpdaterSupported: () => true,
    getRunningAppSignature: async () => ({ signed: true, isDeveloperId: true }),
  }));
  const service = await import('./update-service.mjs');
  return { profile, service };
}
async function reload(profile, version) {
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: { getVersion: () => version, getPath: () => profile, isQuitting: false },
    dialog: {},
  }));
  vi.doMock('./kingfisher-updater.mjs', () => ({
    on: () => () => {},
    isUpdaterSupported: () => true,
    getRunningAppSignature: async () => ({ signed: true, isDeveloperId: true }),
  }));
  return import('./update-service.mjs');
}
afterEach(() => {
  for (const p of profiles.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('the post-update notice', () => {
  it('is not shown on a fresh profile: a first install is not an update', async () => {
    const { service } = await load('1.1.0');
    expect(service.recordLaunch('1.1.0')).toBeNull();
    expect(service.hasAcknowledgedUpdate('1.1.0')).toBe(true);
  });

  it('is shown after the version changes, naming the version it replaced', async () => {
    const { profile, service } = await load('1.0.5');
    expect(service.recordLaunch('1.0.5')).toBeNull();
    const next = await reload(profile, '1.1.0');
    expect(next.recordLaunch('1.1.0')).toEqual({ version: '1.1.0', previousVersion: '1.0.5' });
  });

  it('stays pending across launches until dismissed, then never returns for that version', async () => {
    const { profile, service } = await load('1.0.5');
    service.recordLaunch('1.0.5');
    let next = await reload(profile, '1.1.0');
    expect(next.recordLaunch('1.1.0')).not.toBeNull();
    next = await reload(profile, '1.1.0');
    expect(next.recordLaunch('1.1.0')).toEqual({ version: '1.1.0', previousVersion: '1.0.5' });
    next.acknowledgeUpdate('1.1.0');
    expect(next.hasAcknowledgedUpdate('1.1.0')).toBe(true);
    next = await reload(profile, '1.1.0');
    expect(next.recordLaunch('1.1.0')).toBeNull();
  });

  it('shows again for the next update after a dismissed one', async () => {
    const { profile, service } = await load('1.0.5');
    service.recordLaunch('1.0.5');
    let next = await reload(profile, '1.1.0');
    next.recordLaunch('1.1.0');
    next.acknowledgeUpdate('1.1.0');
    next = await reload(profile, '1.2.0');
    expect(next.recordLaunch('1.2.0')).toEqual({ version: '1.2.0', previousVersion: '1.1.0' });
  });
});

describe('a downgrade', () => {
  /*
    2026-09-14: the update harness's relaunched 1.1.6 opened the owner's
    real profile for eight seconds and recorded itself there; the owner's
    installed 1.1.4 then said "Kingfisher was updated to 1.1.4. Previously
    1.1.6." Going backwards is recorded, and it is not called an update.
  */
  it('is recorded without a notice', async () => {
    const { profile, service } = await load('1.1.6');
    expect(service.recordLaunch('1.1.6')).toBeNull();
    const older = await reload(profile, '1.1.4');
    expect(older.recordLaunch('1.1.4')).toBeNull();
    expect(older.hasAcknowledgedUpdate('1.1.4')).toBe(true);
    // The next real update from there is still announced, from the version
    // that actually ran last.
    const newer = await reload(profile, '1.1.7');
    expect(newer.recordLaunch('1.1.7')).toEqual({ version: '1.1.7', previousVersion: '1.1.4' });
  });
});
