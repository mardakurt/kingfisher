import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  RELAUNCH_PROFILE_FILE,
  RELAUNCH_PROFILE_TTL_MS,
  isDowngrade,
  takeRelaunchProfile,
  writeRelaunchProfile,
} from './relaunch-profile.mjs';

/*
  The update engine relaunches the bundle with no arguments. For three
  phases the update harness's relaunched instance therefore opened the
  owner's real profile, ran against it and recorded itself there; the
  owner's installed build then announced a "downgrade" as an update. The
  handoff below is what stops the first; `isDowngrade` is what stops the
  second from ever reading as an update, whatever caused it.
*/
const dirs = [];
const temp = (label) => {
  const dir = mkdtempSync(path.join(tmpdir(), `kingfisher-${label}-`));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the relaunch profile handoff', () => {
  it('hands the profile that installed the update to the launch that follows', () => {
    const cache = temp('cache');
    const profile = temp('profile');
    expect(writeRelaunchProfile(cache, profile, 1_000_000)).toBe(true);
    expect(takeRelaunchProfile(cache, 1_000_000 + 8_000)).toEqual({ userData: profile });
  });

  it('is consumed by exactly one launch', () => {
    const cache = temp('cache');
    const profile = temp('profile');
    writeRelaunchProfile(cache, profile, 0);
    takeRelaunchProfile(cache, 1_000);
    expect(existsSync(path.join(cache, RELAUNCH_PROFILE_FILE))).toBe(false);
    expect(takeRelaunchProfile(cache, 2_000)).toBeNull();
  });

  it('ignores a handoff older than the relaunch budget, and removes it', () => {
    const cache = temp('cache');
    const profile = temp('profile');
    writeRelaunchProfile(cache, profile, 0);
    expect(takeRelaunchProfile(cache, RELAUNCH_PROFILE_TTL_MS + 1)).toBeNull();
    expect(existsSync(path.join(cache, RELAUNCH_PROFILE_FILE))).toBe(false);
  });

  it('ignores a profile that no longer exists, a relative path, and a malformed file', () => {
    const cache = temp('cache');
    writeRelaunchProfile(cache, path.join(temp('gone'), 'missing'), 0);
    expect(takeRelaunchProfile(cache, 1)).toBeNull();
    writeRelaunchProfile(cache, 'relative/profile', 0);
    expect(takeRelaunchProfile(cache, 1)).toBeNull();
    writeFileSync(path.join(cache, RELAUNCH_PROFILE_FILE), '{not json', 'utf8');
    expect(takeRelaunchProfile(cache, 1)).toBeNull();
    expect(existsSync(path.join(cache, RELAUNCH_PROFILE_FILE))).toBe(false);
  });

  it('writes nothing a person can be surprised by: the profile path and a timestamp', () => {
    const cache = temp('cache');
    const profile = temp('profile');
    writeRelaunchProfile(cache, profile, Date.UTC(2026, 8, 14, 19, 21, 29));
    expect(JSON.parse(readFileSync(path.join(cache, RELAUNCH_PROFILE_FILE), 'utf8'))).toEqual({
      userData: profile,
      at: '2026-09-14T19:21:29.000Z',
    });
  });

  it('never throws when the cache directory cannot be written', () => {
    expect(writeRelaunchProfile('/dev/null/not-a-dir', '/tmp', 0)).toBe(false);
  });
});

describe('what counts as a downgrade', () => {
  it('is a launch of an older version on the profile', () => {
    expect(isDowngrade('1.1.6', '1.1.4')).toBe(true);
    expect(isDowngrade('1.2.0', '1.1.9')).toBe(true);
    expect(isDowngrade('2.0.0', '1.99.99')).toBe(true);
  });

  it('is not an update, nor the same version, nor a pre-release of the same number', () => {
    expect(isDowngrade('1.1.4', '1.1.6')).toBe(false);
    expect(isDowngrade('1.1.6', '1.1.6')).toBe(false);
    expect(isDowngrade('1.1.6-rc.1', '1.1.6')).toBe(false);
    expect(isDowngrade('1.1', '1.1.0')).toBe(false);
  });
});
