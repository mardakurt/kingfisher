/**
 * What a packaged Kingfisher must contain for Sparkle to work — one list,
 * read by the afterPack hook (`scripts/verify-package.mjs`), the boot gate
 * (`scripts/verify-package-boot.mjs`) and the DMG verifier
 * (`scripts/verify-dmg.mjs`), so that a bundle Sparkle cannot run in fails
 * the build rather than the first Check for Updates on somebody's Mac.
 *
 * The pieces, relative to `Kingfisher.app/Contents`:
 *
 *   Frameworks/Sparkle.framework/Versions/B/Sparkle        the framework
 *   Frameworks/Sparkle.framework/Versions/B/Autoupdate     the installer
 *   Frameworks/Sparkle.framework/Versions/B/Updater.app    the progress agent
 *   Resources/app.asar.unpacked/native/sparkle/build/kingfisher-sparkle.node
 *                                                          the bridge, unpacked
 *   Info.plist  SUFeedURL, SUPublicEDKey, SUEnableAutomaticChecks=false,
 *               SUAllowsAutomaticUpdates=false
 *
 * …and the absence of `XPCServices`, which are for sandboxed applications
 * (`scripts/fetch-sparkle.mjs` strips them).
 */

import { lstatSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The record of which Sparkle is embedded and which key signs updates. */
export function readSparkleRecord(desktopDir = path.resolve(HERE, '..')) {
  return JSON.parse(readFileSync(path.join(desktopDir, 'sparkle.json'), 'utf8'));
}

export const SPARKLE_BUNDLE_FILES = Object.freeze([
  'Frameworks/Sparkle.framework/Versions/B/Sparkle',
  'Frameworks/Sparkle.framework/Versions/B/Autoupdate',
  'Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents/MacOS/Updater',
  'Frameworks/Sparkle.framework/Versions/B/Resources/Info.plist',
  'Resources/app.asar.unpacked/native/sparkle/build/kingfisher-sparkle.node',
]);

export const SPARKLE_BUNDLE_ABSENT = Object.freeze([
  'Frameworks/Sparkle.framework/Versions/B/XPCServices',
  'Frameworks/Sparkle.framework/XPCServices',
]);

/**
 * One top-level value from an XML property list, as a string: `<string>` and
 * `<integer>` verbatim, `<true/>`/`<false/>` as "true"/"false", null when
 * the key is absent. electron-builder writes Info.plist as XML, and the
 * Sparkle keys are all top-level, so this needs no `plutil` — which keeps
 * the gate runnable, and this module's tests honest, on Linux CI.
 */
export function plistValue(file, key) {
  let xml;
  try {
    xml = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `<key>${escaped}</key>\\s*(?:<(string|integer|real|date)>([^<]*)</\\1>|<(true|false)/>)`,
  ).exec(xml);
  if (!match) return null;
  if (match[3]) return match[3];
  return match[2]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Every check, as `{ name, ok, detail }`. `contents` is `Kingfisher.app/Contents`.
 * `expect` may carry `feedURL` and `publicKey`; when absent the record is used.
 */
export function inspectSparkleBundle(contents, expect = {}) {
  const record = readSparkleRecord();
  const feedURL = expect.feedURL ?? null;
  const publicKey = expect.publicKey ?? record.publicKey;
  const checks = [];
  for (const relative of SPARKLE_BUNDLE_FILES) {
    const file = path.join(contents, relative);
    let ok = false;
    try {
      ok = statSync(file).size > 0;
    } catch {
      ok = false;
    }
    checks.push({ name: `sparkle: ${relative}`, ok, detail: ok ? 'present' : 'missing or empty' });
  }
  for (const relative of SPARKLE_BUNDLE_ABSENT) {
    const file = path.join(contents, relative);
    let present = false;
    try {
      // lstat: a dangling symlink is still something shipped.
      present = Boolean(lstatSync(file));
    } catch {
      present = false;
    }
    checks.push({
      name: `sparkle: no ${path.basename(relative)} (not sandboxed)`,
      ok: !present,
      detail: present ? `${relative} is shipped` : 'absent',
    });
  }
  const frameworkPlist = path.join(
    contents,
    'Frameworks/Sparkle.framework/Versions/B/Resources/Info.plist',
  );
  const frameworkVersion = plistValue(frameworkPlist, 'CFBundleShortVersionString');
  checks.push({
    name: `sparkle: framework is ${record.version}`,
    ok: frameworkVersion === record.version,
    detail: frameworkVersion ?? 'unreadable',
  });
  const infoPlist = path.join(contents, 'Info.plist');
  const feed = plistValue(infoPlist, 'SUFeedURL');
  checks.push({
    name: 'sparkle: SUFeedURL',
    ok: feedURL ? feed === feedURL : Boolean(feed && /^https:\/\//.test(feed)),
    detail: feed ?? 'missing',
  });
  const key = plistValue(infoPlist, 'SUPublicEDKey');
  checks.push({
    name: 'sparkle: SUPublicEDKey is the recorded key',
    ok: Boolean(key) && key === publicKey,
    detail: key ? `${key.slice(0, 8)}…` : 'missing',
  });
  const automatic = plistValue(infoPlist, 'SUEnableAutomaticChecks');
  checks.push({
    name: 'sparkle: SUEnableAutomaticChecks is false',
    ok: automatic === 'false',
    detail: automatic ?? 'missing',
  });
  const autoDownload = plistValue(infoPlist, 'SUAllowsAutomaticUpdates');
  checks.push({
    name: 'sparkle: SUAllowsAutomaticUpdates is false',
    ok: autoDownload === 'false',
    detail: autoDownload ?? 'missing',
  });
  return checks;
}

export function assertSparkleBundle(contents, expect = {}) {
  const failed = inspectSparkleBundle(contents, expect).filter((check) => !check.ok);
  if (failed.length) {
    throw new Error(
      `Sparkle is not complete in this bundle:\n${failed.map((c) => `  ${c.name}: ${c.detail}`).join('\n')}`,
    );
  }
}
