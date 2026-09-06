/**
 * Where the shell finds the two things it runs, packaged and unpackaged.
 *
 * Kept apart from `main.mjs` because it is the one piece of the shell that
 * differs between `npm run desktop` in a checkout and a signed `.app` on
 * somebody's disk, and a wrong answer here fails at launch in the packaged
 * build only — the case hardest to notice while developing.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the runtime layout.
 *
 * Unpackaged, `desktop/` sits inside the repository, so the companion is two
 * directories up and the web bundle is the one `build-desktop-web.mjs` wrote.
 * Packaged, both are unpacked resources beside the app, because both spawn or
 * open things and neither can be read from inside an asar archive.
 */
export function resolveLayout({ resourcesPath, packaged, here = HERE } = {}) {
  if (!packaged) {
    const repo = path.resolve(here, '..', '..');
    return {
      packaged: false,
      repo,
      companionEntry: path.join(repo, 'companion', 'src', 'server.mjs'),
      webEntry: path.join(repo, 'desktop', 'app', 'server.js'),
      companionData: null,
    };
  }
  const base = path.join(resourcesPath, 'kingfisher');
  return {
    packaged: true,
    repo: base,
    companionEntry: path.join(base, 'companion', 'src', 'server.mjs'),
    webEntry: path.join(base, 'app', 'server.js'),
    companionData: null,
  };
}

/**
 * What is missing, named.
 *
 * A shell that cannot find its web bundle should say which file it looked for.
 * The most common cause by a distance is a checkout where
 * `npm run desktop:build:web` has not been run yet, and that is a sentence, not
 * a stack trace.
 */
export function missingParts(layout) {
  const missing = [];
  if (!existsSync(layout.companionEntry)) missing.push(layout.companionEntry);
  if (!existsSync(layout.webEntry)) missing.push(layout.webEntry);
  return missing;
}
