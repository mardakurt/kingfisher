/**
 * External cache locations for Kingfisher's build pipeline.
 *
 * Phase 28 demands that the application repository stay compact.
 * Raw upstream chess archives and candidate pack builds therefore
 * live OUTSIDE the source tree by default. This module centralises
 * the resolution rules so a developer can override any of them
 * with an environment variable and every script agrees on where
 * the bytes go.
 *
 * Variables:
 *
 *   KINGFISHER_CACHE_DIR
 *     Where downloaded upstream archives are cached. The build
 *     pipeline reuses whatever is already there.
 *   KINGFISHER_DATA_BUILD_DIR
 *     Where candidate pack builds land. The application repository
 *     should not see the contents of this directory; it is read by
 *     the developer who built it.
 *   KINGFISHER_ENGINE_DIR
 *     Where managed engines and tablebases go. The engine binaries
 *     themselves are GPL and never committed; this just decides
 *     where `npm run engines:install` puts them.
 *
 * Defaults follow the platform's user-cache conventions:
 *
 *   macOS:  ~/Library/Caches/Kingfisher
 *   Linux:  $XDG_CACHE_HOME/kingfisher  (default ~/.cache/kingfisher)
 *   Windows: %LOCALAPPDATA%/Kingfisher/Cache
 *
 * On any failure to resolve the user-cache directory the module
 * falls back to `.cache/` inside the project root, so a developer
 * who clones the repo and runs `npm run reference:build` without
 * configuration still gets a working setup. The project is
 * supposed to keep that fallback gitignored.
 */
import { mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const APP_NAME = 'kingfisher';
const PROJECT_FALLBACK = '.cache';

function userCacheRoot() {
  const home = os.homedir();
  const env = process.env;
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'Kingfisher');
  }
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return path.join(local, 'Kingfisher', 'Cache');
  }
  const xdg = env.XDG_CACHE_HOME;
  if (xdg && xdg.length > 0) return path.join(xdg, APP_NAME);
  return path.join(home, '.cache', APP_NAME);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Fall back to a project-local directory. The clone workflow
      // still works; the bytes just sit next to the source rather
      // than in the user's home.
      return path.resolve(process.cwd(), PROJECT_FALLBACK);
    }
  }
  return dir;
}

function resolve(envName, subdir) {
  const override = process.env[envName];
  if (override && override.length > 0) return path.resolve(override);
  return ensureDir(path.join(userCacheRoot(), subdir));
}

export const cachePaths = {
  archives: resolve('KINGFISHER_CACHE_DIR', 'archives'),
  dataBuilds: resolve('KINGFISHER_DATA_BUILD_DIR', 'data-builds'),
  engines: resolve('KINGFISHER_ENGINE_DIR', 'engines'),
  /**
   * The real-scale benchmark database. Five gigabytes, rebuilt by
   * `node scripts/bench-real-scale.mjs` from cached upstream
   * archives. Lives outside the project by default so a normal
   * clone stays small. Set `KINGFISHER_REAL_SCALE_DIR` to override.
   */
  realScale: resolve('KINGFISHER_REAL_SCALE_DIR', 'real-scale'),
};
