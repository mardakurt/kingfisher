/**
 * A `Kingfisher.app/Contents` with everything `sparkle-bundle.mjs` looks for,
 * as files with content — structural evidence for the gates' tests, never
 * a runnable framework. Excluded from the packaged shell by
 * `electron-builder.yml` (`!src/test-helpers/**`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { SPARKLE_BUNDLE_FILES, readSparkleRecord } from '../sparkle-bundle.mjs';

const escape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function infoPlist(entries) {
  const body = Object.entries(entries)
    .map(([key, value]) =>
      typeof value === 'boolean'
        ? `    <key>${key}</key>\n    <${value}/>`
        : `    <key>${key}</key>\n    <string>${escape(value)}</string>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}

export function writeSparkleFixture(
  contents,
  {
    feedURL = 'https://github.com/mardakurt/kingfisher/releases/latest/download/appcast.xml',
    publicKey = readSparkleRecord().publicKey,
    version = readSparkleRecord().version,
    automaticChecks = false,
    automaticUpdates = false,
    extraInfo = {},
  } = {},
) {
  for (const relative of SPARKLE_BUNDLE_FILES) {
    const file = path.join(contents, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    if (relative.endsWith('Info.plist')) {
      writeFileSync(
        file,
        infoPlist({
          CFBundleIdentifier: 'org.sparkle-project.Sparkle',
          CFBundleShortVersionString: version,
        }),
      );
    } else {
      writeFileSync(file, 'fixture');
    }
  }
  writeFileSync(
    path.join(contents, 'Info.plist'),
    infoPlist({
      CFBundleIdentifier: 'app.kingfisher.chess',
      SUFeedURL: feedURL,
      SUPublicEDKey: publicKey,
      SUEnableAutomaticChecks: automaticChecks,
      SUAllowsAutomaticUpdates: automaticUpdates,
      ...extraInfo,
    }),
  );
  return contents;
}
