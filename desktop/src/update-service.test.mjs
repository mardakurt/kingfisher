/**
 * The update service's state machine, driven by the bridge's own events.
 *
 * Sparkle is replaced by an in-memory fake of `sparkle-updater.mjs` — the
 * module boundary, not the thing under test — and the events are the
 * strings `bridge.mm` emits (`EVENTS` in `sparkle-updater.mjs`). What is
 * pinned here is what the service adds on top of Sparkle:
 *
 *   - the verdict the menu and the Settings panel render, for every stage;
 *   - the save barrier, at the one moment Sparkle asks whether it may
 *     relaunch: released on `ok: true`, held on anything else;
 *   - the profile handoff, written before the relaunch is released;
 *   - the preview channel, which asks the network nothing;
 *   - a build without Sparkle, which says so instead of pretending.
 */

import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const cacheDirs = [];

function makeEngine({ started = true } = {}) {
  const listeners = new Map();
  const on = (event, listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => listeners.get(event)?.delete(listener);
  };
  const emit = (event, payload = {}) => {
    for (const listener of Array.from(listeners.get(event) ?? [])) listener(payload);
  };
  const cacheDir = mkdtempSync(path.join(tmpdir(), 'kingfisher-updater-cache-'));
  cacheDirs.push(cacheDir);
  return {
    listeners,
    on,
    emit,
    cacheDir,
    canCheck: true,
    start: vi.fn(() => ({ started, sparkleVersion: '2.10.0', reason: started ? null : 'no key' })),
    describe: vi.fn(() => ({
      started,
      sparkleVersion: '2.10.0',
      reason: started ? null : 'no key',
    })),
    isUpdaterSupported: vi.fn(() => started),
    checkForUpdates: vi.fn(),
    checkForUpdateInformation: vi.fn(),
    resumeRelaunch: vi.fn(() => true),
    hasPostponedRelaunch: vi.fn(() => false),
  };
}

function makeDialog() {
  // `showMessageBox(parent, options)` when the shell has a window, else
  // `showMessageBox(options)`; the tests read the options either way.
  const showMessageBox = vi.fn(async () => ({ response: 0 }));
  showMessageBox.options = () => {
    const args = showMessageBox.mock.calls[0];
    return args.length === 2 ? args[1] : args[0];
  };
  return { showMessageBox };
}

async function loadService(
  engine,
  { dialog = makeDialog(), userData = '/tmp/kingfisher-profile' } = {},
) {
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: {
      getVersion: () => '1.1.7',
      getPath: (name) => (name === 'userData' ? userData : '/tmp'),
    },
    dialog,
    shell: { openExternal: vi.fn(async () => undefined) },
  }));
  vi.doMock('./sparkle-updater.mjs', () => ({
    on: engine.on,
    start: engine.start,
    describe: engine.describe,
    isUpdaterSupported: engine.isUpdaterSupported,
    checkForUpdates: engine.checkForUpdates,
    checkForUpdateInformation: engine.checkForUpdateInformation,
    canCheckForUpdates: () => engine.canCheck,
    resumeRelaunch: engine.resumeRelaunch,
    hasPostponedRelaunch: engine.hasPostponedRelaunch,
    updaterCacheDir: () => engine.cacheDir,
  }));
  vi.doMock('./save-barrier.mjs', () => ({ DEFAULT_TIMEOUT_MS: 5_000 }));
  vi.doMock('./log.mjs', () => ({ log: () => {} }));
  const service = await import('./update-service.mjs');
  return { service, dialog };
}

const found = {
  version: '600',
  displayVersion: '1.1.8',
  title: 'Kingfisher 1.1.8',
  date: 'Mon, 14 Sep 2026 20:00:00 +0000',
  contentLength: 171_000_000,
  fileURL:
    'https://github.com/mardakurt/kingfisher/releases/download/v1.1.8/Kingfisher-1.1.8-arm64.zip',
  releaseNotesURL: null,
};

afterEach(() => {
  for (const dir of cacheDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the verdict follows Sparkle', () => {
  it('a found update is available, with its version, build and size; nothing found is up to date', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    const seen = [];
    service.subscribe((v) => seen.push(v.status));
    service.startUpdater({});
    expect(engine.start).toHaveBeenCalledOnce();

    await service.check();
    expect(engine.checkForUpdates).toHaveBeenCalledOnce();
    engine.emit('checking', { check: 'user' });
    expect(service.getState()).toMatchObject({ status: 'checking', quiet: false });
    engine.emit('found', found);
    expect(service.getState()).toMatchObject({
      status: 'available',
      currentVersion: '1.1.7',
      latestVersion: '1.1.8',
      latestBuild: '600',
      sizeBytes: 171_000_000,
      releaseName: 'Kingfisher 1.1.8',
    });
    engine.emit('checking', { check: 'user' });
    engine.emit('not-found', { noUpdateReason: 1 });
    expect(service.getState()).toMatchObject({
      status: 'up-to-date',
      reason: 'on the latest version',
    });
    expect(seen).toEqual(['idle', 'checking', 'available', 'checking', 'up-to-date']);
  });

  it('the quiet launch-time check relabels the menu and never opens a window', async () => {
    const engine = makeEngine();
    const { service, dialog } = await loadService(engine);
    service.startUpdater({});
    expect(service.checkQuietly()).toBe(true);
    expect(engine.checkForUpdateInformation).toHaveBeenCalledOnce();
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    engine.emit('checking', { check: 'information' });
    expect(service.getState()).toMatchObject({ status: 'checking', quiet: true });
    engine.emit('found', found);
    expect(service.getState()).toMatchObject({ status: 'available', latestVersion: '1.1.8' });
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    // …and the person's own click then goes to Sparkle's window.
    await service.check();
    expect(engine.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('download, verification and readiness are reported stage by stage', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('found', found);
    engine.emit('choice', { choice: 'install', stage: 'not-downloaded' });
    engine.emit('will-download', { item: found, url: found.fileURL });
    expect(service.getState()).toMatchObject({ status: 'downloading', latestVersion: '1.1.8' });
    engine.emit('did-download', { item: found });
    expect(service.getState().status).toBe('downloaded');
    engine.emit('will-extract', { item: found });
    expect(service.getState().status).toBe('verifying');
    engine.emit('did-extract', { item: found });
    expect(service.getState().status).toBe('ready');
    engine.emit('will-install', { item: found });
    expect(service.getState().status).toBe('installing');
  });

  it('"Skip This Version" returns the menu to its plain label; "Remind Me Later" keeps the update available', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('found', found);
    engine.emit('choice', { choice: 'dismiss', stage: 'not-downloaded' });
    expect(service.getState()).toMatchObject({ status: 'available', latestVersion: '1.1.8' });
    engine.emit('choice', { choice: 'skip', stage: 'not-downloaded' });
    expect(service.getState().status).toBe('idle');
  });

  it('a cancelled download leaves the update available; a failed one says why', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('found', found);
    engine.emit('will-download', { item: found });
    engine.emit('download-cancelled', {});
    expect(service.getState()).toMatchObject({ status: 'available', latestVersion: '1.1.8' });
    engine.emit('will-download', { item: found });
    engine.emit('download-failed', {
      item: found,
      error: { code: 2001, description: 'The network connection was lost.' },
    });
    expect(service.getState()).toMatchObject({
      status: 'failed',
      reason: 'The update could not be downloaded. Check the connection and try again.',
    });
  });

  it('a cycle that ends without a verdict does not leave the menu on "Checking…"', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('checking', { check: 'user' });
    engine.emit('finished', { check: 'user', error: null });
    expect(service.getState().status).toBe('idle');
  });

  it('Sparkle aborting is read by its error code', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('found', found);
    // The person cancelled at the authorisation prompt: still available.
    engine.emit('aborted', { code: 4007, description: 'cancelled' });
    expect(service.getState()).toMatchObject({ status: 'available', latestVersion: '1.1.8' });
    // "No update" is reported through not-found and ignored here.
    engine.emit('aborted', { code: 1001, description: 'no update' });
    expect(service.getState().status).toBe('available');
    // A feed that cannot be read, during a check: unable, in a sentence.
    engine.emit('checking', { check: 'user' });
    engine.emit('aborted', {
      code: 1002,
      description: 'An error occurred in retrieving update information.',
    });
    expect(service.getState()).toMatchObject({
      status: 'unable-to-check',
      reason: 'The release feed could not be read. The download page always has the newest build.',
    });
    // A bad signature, after a download: failed, and it says the update was not installed.
    engine.emit('will-download', { item: found });
    engine.emit('aborted', { code: 3001, description: 'The update is improperly signed.' });
    expect(service.getState()).toMatchObject({
      status: 'failed',
      reason: 'The downloaded update is not signed by Kingfisher and was not installed.',
    });
  });
});

describe('the save barrier, when Sparkle asks to relaunch', () => {
  it('is released on ok, after the profile handoff is written', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine, {
      userData: '/Users/someone/Library/Application Support/kf-test',
    });
    const order = [];
    const onSaveBarrier = vi.fn(async () => {
      order.push('barrier');
      return { ok: true };
    });
    engine.resumeRelaunch.mockImplementation(() => {
      order.push('resume');
      return true;
    });
    service.startUpdater({ onSaveBarrier });
    engine.emit('found', found);
    engine.emit('will-install', { item: found });
    engine.emit('postpone-relaunch', { item: found });
    expect(service.getState().status).toBe('waiting-for-save');
    await vi.waitFor(() => expect(engine.resumeRelaunch).toHaveBeenCalledOnce());
    expect(onSaveBarrier).toHaveBeenCalledWith({ timeoutMs: 5_000 });
    expect(order).toEqual(['barrier', 'resume']);
    expect(service.getState().status).toBe('installing');
    const handoff = path.join(engine.cacheDir, 'relaunch-profile.json');
    expect(existsSync(handoff)).toBe(true);
    expect(JSON.parse(readFileSync(handoff, 'utf8')).userData).toBe(
      '/Users/someone/Library/Application Support/kf-test',
    );
    engine.emit('will-relaunch', {});
    expect(service.getState().status).toBe('restarting');
  });

  it('is held on a failed barrier: the install block is never run and the person is told', async () => {
    const engine = makeEngine();
    const { service, dialog } = await loadService(engine);
    const onSaveBarrier = vi.fn(async () => ({ ok: false, reason: 'timeout' }));
    service.startUpdater({ onSaveBarrier });
    engine.emit('found', found);
    engine.emit('postpone-relaunch', { item: found });
    await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce());
    expect(engine.resumeRelaunch).not.toHaveBeenCalled();
    expect(service.getState()).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('could not confirm that your work finished saving'),
    });
    expect(dialog.showMessageBox.options().detail).toContain('Quit Kingfisher to install it');
    expect(existsSync(path.join(engine.cacheDir, 'relaunch-profile.json'))).toBe(false);
  });

  it('a barrier that throws is a failed barrier', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({
      onSaveBarrier: async () => {
        throw new Error('ipc gone');
      },
    });
    engine.emit('postpone-relaunch', { item: found });
    await vi.waitFor(() => expect(service.getState().status).toBe('failed'));
    expect(engine.resumeRelaunch).not.toHaveBeenCalled();
    expect(service.getState().reason).toContain('(ipc gone)');
  });

  it('is skipped when the application is already quitting, and the relaunch is released', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    const onSaveBarrier = vi.fn(async () => ({ ok: true }));
    service.startUpdater({ onSaveBarrier, isQuitting: () => true });
    engine.emit('postpone-relaunch', { item: found });
    await vi.waitFor(() => expect(engine.resumeRelaunch).toHaveBeenCalledOnce());
    expect(onSaveBarrier).not.toHaveBeenCalled();
    expect(existsSync(path.join(engine.cacheDir, 'relaunch-profile.json'))).toBe(true);
  });

  it('an install deferred to quit still hands the profile to the relaunch', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.emit('will-install-on-quit', { item: found });
    expect(existsSync(path.join(engine.cacheDir, 'relaunch-profile.json'))).toBe(true);
  });
});

describe('the channel', () => {
  it('a preview build answers from what it is, and asks the network nothing', async () => {
    const engine = makeEngine();
    const { service, dialog } = await loadService(engine);
    service.startUpdater({});
    service.configureChannel({
      name: 'preview',
      build: 431,
      downloadUrl: 'https://kingfisherchess.app/',
    });
    const verdict = await service.check();
    expect(verdict).toMatchObject({
      status: 'preview',
      currentVersion: '1.1.7',
      build: 431,
      downloadUrl: 'https://kingfisherchess.app/',
    });
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox.options().message).toContain('preview build 431');
    expect(service.manualDownloadUrl()).toBe('https://kingfisherchess.app/');
    expect(service.checkQuietly()).toBe(false);
    expect(engine.checkForUpdateInformation).not.toHaveBeenCalled();
  });

  it('a stable build — and an unconfigured one — asks Sparkle', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    for (const name of ['stable', 'dev', undefined]) {
      service.configureChannel({ name });
      engine.checkForUpdates.mockClear();
      await service.check();
      expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(service.manualDownloadUrl()).toBeNull();
    }
  });

  it('while Sparkle is busy the click does nothing, as the disabled menu item says', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    service.startUpdater({});
    engine.canCheck = false;
    await service.check();
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    expect(service.checkQuietly()).toBe(false);
  });
});

describe('the message boxes', () => {
  it('hang from the main window as sheets when there is one, and stand alone otherwise', async () => {
    const engine = makeEngine({ started: false });
    const { service, dialog } = await loadService(engine);
    const window = { isDestroyed: () => false };
    service.startUpdater({ parentWindow: () => window });
    await service.check();
    expect(dialog.showMessageBox.mock.calls[0][0]).toBe(window);
    dialog.showMessageBox.mockClear();
    service.startUpdater({ parentWindow: () => ({ isDestroyed: () => true }) });
    await service.check();
    expect(dialog.showMessageBox.mock.calls[0]).toHaveLength(1);
  });
});

describe('a build without Sparkle', () => {
  it('says so in a message box and in the verdict, and never pretends to check', async () => {
    const engine = makeEngine({ started: false });
    const { service, dialog } = await loadService(engine);
    const started = service.startUpdater({});
    expect(started.started).toBe(false);
    const verdict = await service.check();
    expect(verdict).toMatchObject({ status: 'unable-to-check', reason: 'no key' });
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox.options().message).toBe(
      'Updates are not available in this build.',
    );
    expect(service.checkQuietly()).toBe(false);
  });
});

describe('what a failed check says', () => {
  it('names the cases a person can meet, and bounds everything else', async () => {
    const engine = makeEngine();
    const { service } = await loadService(engine);
    expect(service.describeCheckFailure({ code: 1002, description: 'x' })).toBe(
      'The release feed could not be read. The download page always has the newest build.',
    );
    expect(service.describeCheckFailure({ code: 1003, description: 'x' })).toContain(
      'Drag it to Applications',
    );
    expect(
      service.describeCheckFailure({
        description: 'The Internet connection appears to be offline.',
      }),
    ).toBe('The release host could not be reached. Check the connection and try again.');
    expect(service.describeCheckFailure({ description: 'HTTP 429 rate limit' })).toBe(
      'The release host refused the request for now. Try again in a few minutes.',
    );
    const long = `Something else went wrong at /tmp/x ${'y'.repeat(300)}\nsecond line`;
    const text = service.describeCheckFailure({ description: long });
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toContain('second line');
    expect(service.describeCheckFailure(undefined)).toBe('The check did not complete.');
  });
});
