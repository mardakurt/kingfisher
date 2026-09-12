/**
 * What one packaged Kingfisher *is*, stated once.
 *
 * The marketing version (`1.0.0`) answers "which release is this?" and it is
 * the only number a user is expected to read. It is not enough on its own:
 * two builds of `1.0.0` from different commits are different programs, and a
 * support report that says "1.0.0" cannot be matched to either. So a build
 * also carries
 *
 *   - a **build number** — `git rev-list --count HEAD` at packaging time,
 *     monotonic on a linear master and reproducible from the commit;
 *   - the **commit** it was built from, and whether the tree was dirty;
 *   - a **channel** — `stable` for a deliberate signed release, `preview` for
 *     the current-master build the landing offers before a trusted release
 *     exists, `dev` for anything built from an undeclared or dirty tree.
 *
 * `desktop/scripts/build.mjs` writes these into the packaged `package.json`
 * under `kingfisher`, and into `CFBundleVersion`. This module reads them back
 * for the diagnostics surface, so a bug report carries all four. Nothing here
 * names a phase: a phase is how the work was organised, not what the user has.
 */

export const CHANNELS = Object.freeze(['stable', 'preview', 'dev']);

/**
 * Read the identity a build recorded, tolerating a package.json that has
 * none — an unpackaged checkout, or a build made before this existed.
 *
 * @param {object} pkg the desktop `package.json` as parsed
 * @param {{ packaged?: boolean }} [context]
 */
export function readBuildIdentity(pkg, { packaged = true } = {}) {
  const version = typeof pkg?.version === 'string' ? pkg.version : 'unknown';
  const raw = pkg?.kingfisher && typeof pkg.kingfisher === 'object' ? pkg.kingfisher : {};
  // Values arrive as strings when they came through electron-builder's `-c`
  // command line, so both shapes are accepted and nothing else is.
  const buildNumber =
    typeof raw.build === 'string' && /^\d+$/.test(raw.build) ? Number(raw.build) : raw.build;
  const build = Number.isInteger(buildNumber) && buildNumber > 0 ? buildNumber : null;
  const commit =
    typeof raw.commit === 'string' && /^[0-9a-f]{7,40}$/.test(raw.commit) ? raw.commit : null;
  const channel = CHANNELS.includes(raw.channel) ? raw.channel : 'dev';
  const dirty = raw.dirty === true || raw.dirty === 'true';
  const landing =
    typeof raw.landing === 'string' && /^https:\/\//.test(raw.landing) ? raw.landing : null;
  return {
    /** The landing page a preview build sends people to for the next one. */
    landing,
    version,
    build,
    commit,
    channel: packaged ? channel : 'dev',
    dirty,
    /** One line for a support report: `1.0.0 (build 412, 1a2b3c4, preview)`. */
    label: describe({ version, build, commit, channel: packaged ? channel : 'dev', dirty }),
  };
}

export function describe({ version, build, commit, channel, dirty }) {
  const parts = [];
  if (build !== null && build !== undefined) parts.push(`build ${build}`);
  if (commit) parts.push(`${commit.slice(0, 7)}${dirty ? '-dirty' : ''}`);
  parts.push(channel);
  return `${version} (${parts.join(', ')})`;
}

/**
 * The artifact name a channel produces. Stable keeps the plain name the
 * release process and the updater already know; preview embeds the build
 * number so that two previews of the same marketing version can never share
 * a filename — and therefore never silently replace each other's bytes.
 */
export function artifactName({ version, build, channel, arch = 'arm64', ext = 'dmg' }) {
  if (channel === 'preview') return `Kingfisher-${version}-preview-${build}-${arch}.${ext}`;
  if (channel === 'dev') return `Kingfisher-${version}-dev-${build ?? 0}-${arch}.${ext}`;
  return `Kingfisher-${version}-${arch}.${ext}`;
}
