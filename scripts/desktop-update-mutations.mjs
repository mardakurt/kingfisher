#!/usr/bin/env node
/**
 * `npm run desktop:update:mutations` — security mutation tests for the
 * update path.
 *
 * Each mutation is a small, targeted change to a feed, a bundle layout or
 * a source file, designed to fail if one of the updater's guard rails
 * drifts. The point is not to enumerate every attack; the point is that a
 * maintainer who weakens one guard is forced to read this file and
 * acknowledge the weakening.
 *
 * Sparkle owns the cryptography — the EdDSA signature over the archive,
 * the Apple code-signature match on the new bundle, the refusal of a
 * lower `sparkle:version` — and those are exercised for real by
 * `desktop:update:real`. What is mutated here is what Kingfisher adds
 * around Sparkle:
 *
 *   1. Tampered archive: one byte changed, and `sign_update --verify`
 *      refuses the feed's signature for it (where the tools exist).
 *   2. Foreign host: an appcast whose enclosure is not on the release
 *      host is refused by the publish step.
 *   3. Wrong length, wrong version, no signature, two items: refused.
 *   4. Plain HTTP enclosure: refused.
 *   5. Automatic checks or automatic downloads switched on in
 *      Info.plist: the bundle gate refuses.
 *   6. A public key other than the recorded one, or none: refused.
 *   7. The bridge refuses to schedule, download or prompt on its own.
 *   8. The relaunch is postponed for the save barrier, and a failed
 *      barrier never releases it.
 *   9. The renderer preload does not expose raw `ipcRenderer`.
 *  10. No update check runs without the person, except the one quiet
 *      information-only look at launch.
 *  11. A feed override is read from the environment only.
 *  12. A publishable build carries the recorded key, never an override.
 *
 * The script exits non-zero on any mutation that does not produce the
 * expected failure.
 */

import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

import { TOOLS, isVendored } from '../desktop/scripts/fetch-sparkle.mjs';
import { inspectSparkleBundle, readSparkleRecord } from '../desktop/src/sparkle-bundle.mjs';
import { writeSparkleFixture } from '../desktop/src/test-helpers/sparkle-fixture.mjs';
import { appcastMismatch, summarizeAppcast } from './desktop-mac-appcast.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
let total = 0;

function mutation(label, fn) {
  total += 1;
  let ok = false;
  let detail = '';
  try {
    const result = fn();
    ok = Boolean(result.ok);
    detail = result.detail || '';
  } catch (error) {
    ok = false;
    detail = String(error?.message ?? error);
  }
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

const read = (relative) => readFileSync(join(HERE, relative), 'utf8');

/* A well-formed feed for a release, to mutate. */
const GOOD = {
  tag: 'v1.1.7',
  version: '1.1.7',
  zipSize: 172_093_126,
};
const goodAppcast = (overrides = {}) => {
  const item = {
    version: '584',
    shortVersion: '1.1.7',
    url: `https://github.com/mardakurt/kingfisher/releases/download/${GOOD.tag}/Kingfisher-1.1.7-arm64.zip`,
    length: GOOD.zipSize,
    signature:
      'D3uO6EmqR4eMAyNpiCDhqApVx7ZX6Eebp4FRzcCCtB/Po9XFE6jaEIqmVyT39/mzfr0petCNJgCendjm3pfjDg==',
    ...overrides,
  };
  const enclosure = `<enclosure url="${item.url}" length="${item.length}" type="application/octet-stream"${item.signature ? ` sparkle:edSignature="${item.signature}"` : ''}/>`;
  const one = `<item><title>${item.shortVersion}</title><sparkle:version>${item.version}</sparkle:version><sparkle:shortVersionString>${item.shortVersion}</sparkle:shortVersionString>${enclosure}</item>`;
  return `<?xml version="1.0"?><rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0"><channel><title>Kingfisher</title>${one}${overrides.twice ? one : ''}</channel></rss>`;
};
const refused = (xml) => appcastMismatch(summarizeAppcast(xml), GOOD);

/* 0. The control: the well-formed feed is accepted. */
mutation('a well-formed feed for the release is accepted (control)', () => {
  const reason = refused(goodAppcast());
  return { ok: reason === null, detail: reason ?? 'accepted' };
});

/* 1. Tampered archive. Needs Sparkle's tools and a key; where the tools
      are vendored (any Mac that has built the desktop), a throwaway key
      is written to a file and used for both sides. Elsewhere the
      refusal is asserted through the publish check's signature guard. */
mutation('a tampered archive fails signature verification', () => {
  if (!isVendored()) {
    const reason = refused(goodAppcast({ signature: 'not-a-signature' }));
    return {
      ok: Boolean(reason),
      detail: `${reason} (Sparkle tools not vendored here; feed guard asserted)`,
    };
  }
  const dir = mkdtempSync(join(tmpdir(), 'kingfisher-mutation-'));
  try {
    const archive = join(dir, 'Kingfisher-9.9.9-arm64.zip');
    writeFileSync(archive, Buffer.from('PK not really a zip, but bytes to sign'));
    // A throwaway key, never the keychain: generate_keys can only export
    // from the keychain, so the harness makes an Ed25519 seed itself —
    // sign_update's key file is the 32-byte seed, base64.
    const { privateKey } = generateKeyPairSync('ed25519');
    const seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
    const keyFile = join(dir, 'key');
    writeFileSync(keyFile, seed.toString('base64'));
    const signed = spawnSync(
      join(TOOLS, 'sign_update'),
      ['--ed-key-file', keyFile, '-p', archive],
      { encoding: 'utf8' },
    );
    if (signed.status !== 0) return { ok: false, detail: `sign_update failed: ${signed.stderr}` };
    const signature = signed.stdout.trim();
    const intact = spawnSync(
      join(TOOLS, 'sign_update'),
      ['--verify', '--ed-key-file', keyFile, archive, signature],
      {
        encoding: 'utf8',
      },
    );
    const bytes = readFileSync(archive);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(archive, bytes);
    const tampered = spawnSync(
      join(TOOLS, 'sign_update'),
      ['--verify', '--ed-key-file', keyFile, archive, signature],
      {
        encoding: 'utf8',
      },
    );
    return {
      ok: intact.status === 0 && tampered.status !== 0,
      detail: `intact: exit ${intact.status}; tampered: exit ${tampered.status}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* 2. Foreign host. */
mutation('a feed whose archive is on a foreign host is refused', () => {
  const reason = refused(
    goodAppcast({ url: 'https://evil.example.com/Kingfisher-1.1.7-arm64.zip' }),
  );
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});

/* 3. Wrong length, wrong version, no signature, two items. */
mutation('a feed with the wrong length is refused', () => {
  const reason = refused(goodAppcast({ length: GOOD.zipSize + 1 }));
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});
mutation('a feed offering another version is refused', () => {
  const reason = refused(goodAppcast({ shortVersion: '1.1.8' }));
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});
mutation('a feed without a signature is refused', () => {
  const reason = refused(goodAppcast({ signature: '' }));
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});
mutation('a feed with two items is refused', () => {
  const reason = refused(goodAppcast({ twice: true }));
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});

/* 4. Plain HTTP. */
mutation('a feed with an http:// archive is refused', () => {
  const reason = refused(
    goodAppcast({
      url: `http://github.com/mardakurt/kingfisher/releases/download/${GOOD.tag}/Kingfisher-1.1.7-arm64.zip`,
    }),
  );
  return { ok: Boolean(reason), detail: reason ?? 'accepted' };
});

/* 5. Automatic checks or downloads switched on. */
mutation('a bundle with automatic checks switched on is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kingfisher-mutation-'));
  try {
    const contents = writeSparkleFixture(join(dir, 'Kingfisher.app', 'Contents'), {
      automaticChecks: true,
    });
    const bad = inspectSparkleBundle(contents).filter((c) => !c.ok);
    return {
      ok: bad.length === 1 && /SUEnableAutomaticChecks/.test(bad[0].name),
      detail: bad.map((c) => c.name).join(', '),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
mutation('a bundle with automatic downloads switched on is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kingfisher-mutation-'));
  try {
    const contents = writeSparkleFixture(join(dir, 'Kingfisher.app', 'Contents'), {
      automaticUpdates: true,
    });
    const bad = inspectSparkleBundle(contents).filter((c) => !c.ok);
    return {
      ok: bad.length === 1 && /SUAllowsAutomaticUpdates/.test(bad[0].name),
      detail: bad.map((c) => c.name).join(', '),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* 6. Another key, or none. */
mutation('a bundle carrying a key other than the recorded one is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kingfisher-mutation-'));
  try {
    const contents = writeSparkleFixture(join(dir, 'Kingfisher.app', 'Contents'), {
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    });
    const bad = inspectSparkleBundle(contents).filter((c) => !c.ok);
    return {
      ok: bad.length === 1 && /SUPublicEDKey/.test(bad[0].name),
      detail: bad.map((c) => c.name).join(', '),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* 7. The bridge's own policy. */
mutation('the bridge never schedules, downloads or prompts on its own', () => {
  const src = read('desktop/native/sparkle/bridge.mm');
  const checks = [
    /automaticallyChecksForUpdates = NO;/.test(src),
    /automaticallyDownloadsUpdates = NO;/.test(src),
    /sendsSystemProfile = NO;/.test(src),
    /updaterShouldPromptForPermissionToCheckForUpdates:[^}]*return NO;/s.test(src),
    !/checkForUpdatesInBackground/.test(src),
  ];
  return {
    ok: checks.every(Boolean),
    detail: `${checks.filter(Boolean).length}/${checks.length} guards present`,
  };
});

/* 8. The save barrier holds the relaunch. */
mutation(
  'the relaunch is postponed for the save barrier, and a failed barrier never releases it',
  () => {
    const bridge = read('desktop/native/sparkle/bridge.mm');
    const service = read('desktop/src/update-service.mjs');
    const postponed =
      /shouldPostponeRelaunchForUpdate:[\s\S]*?gPostponedInstall = \[installHandler copy\];[\s\S]*?return YES;/.test(
        bridge,
      );
    const release =
      /async function releaseRelaunch\(\)[\s\S]*?if \(!barrier\?\.ok\) \{[\s\S]*?return;\s*\}[\s\S]*?sparkle\.resumeRelaunch\(\)/.test(
        service,
      );
    const noEarlyResume = !/if \(!barrier\?\.ok\) \{[^}]*resumeRelaunch/.test(service);
    return {
      ok: postponed && release && noEarlyResume,
      detail: `postponed ${postponed}, held on failure ${release && noEarlyResume}`,
    };
  },
);

/* 9. The preload. */
mutation('the renderer preload does not expose raw ipcRenderer', () => {
  const preload = read('desktop/src/preload.cjs');
  const exposed = (preload.match(/exposeInMainWorld\(\s*['"]([^'"]+)['"]/g) || []).map(
    (m) => m.match(/['"]([^'"]+)['"]/)[1],
  );
  const leaks = exposed.filter((n) => n === 'ipcRenderer' || n === 'electron' || n === 'webUtils');
  return {
    ok: leaks.length === 0 && exposed.includes('kingfisher'),
    detail:
      leaks.length === 0
        ? `preload exposes: ${[...new Set(exposed)].join(', ')}`
        : `leaked global(s): ${leaks.join(', ')}`,
  };
});

/* 10. No check without the person, except the quiet look. */
mutation(
  'no update check runs without the person, except the quiet information-only look at launch',
  () => {
    const main = read('desktop/src/main.mjs');
    const service = read('desktop/src/update-service.mjs');
    // main.mjs calls check() from the menu and the renderer's request, and
    // checkQuietly() once after launch; nothing else.
    const checkCalls = (main.match(/void check\(\)/g) || []).length;
    const quietCalls = (main.match(/checkQuietly\(\)/g) || []).length;
    const menuAndIpc =
      /onCheckForUpdates: \(\) => void check\(\)/.test(main) &&
      /'kingfisher:show-update-dialog'[\s\S]{0,80}void check\(\)/.test(main);
    const oneTimer =
      (main.match(/setTimeout\(\(\) => \{\s*try \{\s*if \(checkQuietly\(\)\)/g) || []).length === 1;
    // The quiet path uses Sparkle's information-only check, never the UI one.
    const quietIsInformation =
      /export function checkQuietly\(\)[\s\S]*?sparkle\.checkForUpdateInformation\(\);/.test(
        service,
      ) &&
      !/export function checkQuietly\(\)[\s\S]*?sparkle\.checkForUpdates\(\)/.test(
        service.split('export function checkQuietly()')[1].split('\n}\n')[0],
      );
    return {
      ok: checkCalls === 2 && quietCalls === 1 && menuAndIpc && oneTimer && quietIsInformation,
      detail: `check() ×${checkCalls} (menu, renderer), checkQuietly() ×${quietCalls}, information-only ${quietIsInformation}`,
    };
  },
);

/* 11. Feed override only from the environment. */
mutation(
  'the feed override comes from the environment only, never from the renderer or a file',
  () => {
    const main = read('desktop/src/main.mjs');
    const service = read('desktop/src/update-service.mjs');
    const fromEnv = /feedURL: process\.env\.KINGFISHER_UPDATER_FEED_URL \|\| null/.test(main);
    const noIpc = !/ipcMain\.(on|handle)\([^)]*feed/i.test(main);
    const serviceOnlyStart =
      (service.match(/feedURL/g) || []).length <= 4 && !/setFeedURL/.test(service);
    return { ok: fromEnv && noIpc && serviceOnlyStart, detail: `env ${fromEnv}, no ipc ${noIpc}` };
  },
);

/* 12. A publishable build carries the recorded key. */
mutation('a publishable build refuses a key override and carries the recorded key', () => {
  const build = read('desktop/scripts/build.mjs');
  const record = readSparkleRecord();
  const refusesOverride =
    /identity\.channel !== 'dev' && sparklePublicKey !== SPARKLE\.publicKey[\s\S]*?process\.exit\(1\)/.test(
      build,
    );
  const intoPlist = /-c\.mac\.extendInfo\.SUPublicEDKey=\$\{sparklePublicKey\}/.test(build);
  const keyShape = /^[A-Za-z0-9+/]{43}=$/.test(record.publicKey);
  return {
    ok: refusesOverride && intoPlist && keyShape,
    detail: `refuses override ${refusesOverride}, key ${record.publicKey.slice(0, 8)}…`,
  };
});

/* 13. The packaged application, where one exists on this machine. The
      bundle gate is run for real against it; without one, the same gate
      is run against the fixture, which is the assertion CI can make. */
mutation('the packaged bundle (or the fixture) passes the Sparkle bundle gate', () => {
  const candidates = [
    process.env.KINGFISHER_DESKTOP_APP,
    join(
      process.env.KINGFISHER_DESKTOP_OUT ?? join(HERE, 'desktop', 'dist'),
      'mac-arm64',
      'Kingfisher.app',
    ),
    join(process.env.TMPDIR ?? '/tmp', 'kingfisher-desktop-dist', 'mac-arm64', 'Kingfisher.app'),
  ].filter(Boolean);
  const app = candidates.find((c) => existsSync(join(c, 'Contents', 'Info.plist')));
  if (app) {
    const bad = inspectSparkleBundle(join(app, 'Contents')).filter((c) => !c.ok);
    return {
      ok: bad.length === 0,
      detail: bad.length
        ? bad.map((c) => `${c.name}: ${c.detail}`).join('; ')
        : `${app} (${statSync(app).mtime.toISOString()})`,
    };
  }
  const dir = mkdtempSync(join(tmpdir(), 'kingfisher-mutation-'));
  try {
    const contents = writeSparkleFixture(join(dir, 'Kingfisher.app', 'Contents'));
    const bad = inspectSparkleBundle(contents).filter((c) => !c.ok);
    return { ok: bad.length === 0, detail: 'fixture (no packaged bundle on this machine)' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${total - failed}/${total} mutations produced the expected failure.`);
exit(failed ? 1 : 0);
