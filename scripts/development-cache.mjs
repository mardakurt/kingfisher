/** Development-only cache layout. No application profile data lives here.
 * Keep the existing cache-paths API intact while Phase 29 updates it.
 * A root override moves every development category together.
 */
import path from 'node:path';
import { cachePaths } from './cache-paths.mjs';

export function developmentCache(env = process.env, defaults = cachePaths) {
  const root = env.KINGFISHER_CACHE_DIR ? path.resolve(env.KINGFISHER_CACHE_DIR) : null;
  const choose = (override, category, fallback) =>
    override ? path.resolve(override) : root ? path.join(root, category) : fallback;
  return {
    archives: choose(env.KINGFISHER_ARCHIVE_CACHE, 'archives', defaults.archives),
    dataBuilds: choose(env.KINGFISHER_DATA_BUILD_DIR, 'data-builds', defaults.dataBuilds),
    engines: choose(env.KINGFISHER_ENGINE_DIR, 'engines', defaults.engines),
    realScale: choose(
      env.KINGFISHER_REAL_SCALE_DIR,
      'real-scale',
      defaults.realScale ?? path.join(path.dirname(defaults.archives), 'real-scale'),
    ),
    engineBuilds: choose(
      env.KINGFISHER_ENGINE_BUILD_DIR,
      'engine-builds',
      path.join(path.dirname(defaults.engines), 'engine-builds'),
    ),
    fleet: choose(env.KINGFISHER_FLEET_DIR, 'engine-tests', path.join(defaults.engines, 'tests')),
  };
}
export const developmentPaths = developmentCache();
